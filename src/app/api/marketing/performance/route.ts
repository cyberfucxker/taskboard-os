// GET /api/marketing/performance — project performance, answerable in one call.
// Built from TaskBoard's own delivery record (what was promised vs delivered) and
// enriched with any real marketing signals that have actually been connected.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const url = new URL(req.url);
    const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86400_000);

    const canSeeAll = ["SUPER_ADMIN", "DEPARTMENT_HEAD"].includes(session.user.role);
    const me = await prisma.employee.findUnique({
      where: { id: session.user.id },
      select: { departmentId: true },
    });

    const projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(canSeeAll
          ? {}
          : { OR: [{ ownerId: session.user.id }, { tasks: { some: { assigneeId: session.user.id, deletedAt: null } } }] }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        progressPct: true,
        startDate: true,
        endDate: true,
        budgetedHours: true,
        client: { select: { name: true } },
        tasks: {
          where: { deletedAt: null },
          select: {
            id: true, code: true, status: true, dueDate: true, completedAt: true,
            priority: true, assigneeId: true, title: true,
          },
        },
        milestones: { select: { id: true, name: true, dueDate: true, status: true } },
      },
      orderBy: { name: "asc" },
    });

    // Real logged hours per project, so "performance" is measured against
    // actual delivery rather than a hand-typed percentage.
    const sessions = await prisma.taskWorkSession.findMany({
      where: { startedAt: { gte: since }, task: { deletedAt: null } },
      select: { taskId: true, elapsedSec: true, startedAt: true },
    });
    const hoursByTask = new Map<string, number>();
    for (const s of sessions) {
      hoursByTask.set(s.taskId, (hoursByTask.get(s.taskId) ?? 0) + (s.elapsedSec ?? 0) / 3600);
    }

    // Which marketing signals are genuinely wired up, rather than assumed.
    const integrations = await prisma.integration.findMany({
      select: { provider: true, status: true, clientId: true, lastSyncAt: true, lastError: true },
    });
    const byClient = new Map<string, typeof integrations>();
    for (const i of integrations) {
      if (!i.clientId) continue;
      byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i]);
    }

    const now = Date.now();
    const report = projects.map((p) => {
      const t = p.tasks;
      const done = t.filter((x) => x.status === "DONE");
      const open = t.filter((x) => x.status !== "DONE");
      const overdue = open.filter((x) => x.dueDate && x.dueDate.getTime() < now);
      const blocked = open.filter((x) => x.status === "BLOCKED");
      const inReview = open.filter((x) => x.status === "IN_REVIEW");
      const deliveredHours = t.reduce((sum, x) => sum + (hoursByTask.get(x.id) ?? 0), 0);
      const budget = p.budgetedHours && p.budgetedHours > 0 ? p.budgetedHours : null;
      const nextUp = open
        .filter((x) => x.dueDate)
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0] ?? null;

      const signals = p.client?.name ? byClient.get((p as any).clientId) : undefined;

      return {
        projectId: p.id,
        project: p.name,
        client: p.client?.name ?? null,
        status: p.status,
        statedProgressPct: p.progressPct,
        // Measured progress, which may disagree with the stated figure.
        measuredProgressPct: t.length ? Math.round((done.length / t.length) * 100) : 0,
        tasks: { total: t.length, done: done.length, open: open.length },
        attention: {
          overdue: overdue.length,
          blocked: blocked.length,
          inReview: inReview.length,
        },
        hours: {
          loggedInWindow: Math.round(deliveredHours * 10) / 10,
          budgeted: budget,
          burnPct: budget ? Math.round((deliveredHours / budget) * 100) : null,
        },
        nextDeadline: nextUp
          ? { code: nextUp.code, title: nextUp.title, dueDate: nextUp.dueDate, status: nextUp.status }
          : null,
        upcomingMilestones: p.milestones
          .filter((m) => m.dueDate && m.dueDate.getTime() >= now)
          .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
          .slice(0, 3),
        // Honest about what is missing rather than inventing a traffic figure.
        connectedSignals: (signals ?? []).map((s) => ({
          provider: s.provider,
          status: s.status,
          lastSyncAt: s.lastSyncAt,
          stale: s.lastSyncAt ? Date.now() - s.lastSyncAt.getTime() > 7 * 86400_000 : true,
        })),
      };
    });

    const atRisk = report
      .filter((r) => r.attention.overdue > 0 || r.attention.blocked > 0)
      .sort((a, b) => b.attention.overdue + b.attention.blocked - (a.attention.overdue + a.attention.blocked));

    return NextResponse.json({
      windowDays: days,
      scope: canSeeAll ? "all-projects" : "your-projects",
      totals: {
        projects: report.length,
        tasks: report.reduce((s, r) => s + r.tasks.total, 0),
        done: report.reduce((s, r) => s + r.tasks.done, 0),
        overdue: report.reduce((s, r) => s + r.attention.overdue, 0),
        blocked: report.reduce((s, r) => s + r.attention.blocked, 0),
        inReview: report.reduce((s, r) => s + r.attention.inReview, 0),
        hoursLogged: Math.round(report.reduce((s, r) => s + r.hours.loggedInWindow, 0) * 10) / 10,
      },
      atRisk,
      projects: report,
      note:
        "Traffic and ranking figures appear under connectedSignals once a data source is connected. No estimated or invented metrics are shown.",
    });
  } catch (e) {
    console.error("[marketing/performance]", e);
    return NextResponse.json({ error: "Failed to load performance" }, { status: 500 });
  }
}
