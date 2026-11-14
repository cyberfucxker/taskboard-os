import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { scopedTaskWhere, effectiveCapsForSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/export?scope=all|mine&format=csv
 * Leadership reporting/audit: dump tasks to CSV. Permission = tasks.manage.
 * Supports status/assignee filters via query params.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole("tasks.manage").catch(() => null);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = req.nextUrl.searchParams.get("scope") ?? "all";
    const status = req.nextUrl.searchParams.get("status");
    const assigneeId = req.nextUrl.searchParams.get("assigneeId");
    const projectId = req.nextUrl.searchParams.get("projectId");

    // "all" is a request for the widest export the CALLER is entitled to,
    // not literally every task in the company — tasks.manage is universal
    // (every role holds it), so without this any employee could export the
    // entire org's task list as CSV.
    const where: any = { deletedAt: null };
    if (scope === "mine") {
      where.OR = [{ assigneeId: session.user.id }, { creatorId: session.user.id }];
    } else {
      const caps = await effectiveCapsForSession(session as any);
      if (!(caps.has("board.view") || caps.has("admin.scope"))) {
        Object.assign(where, await scopedTaskWhere(session as any));
      }
    }
    if (status) where.status = status;
    if (assigneeId) where.assigneeId = assigneeId;
    if (projectId) where.projectId = projectId;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        assignee: { select: { name: true } },
        creator: { select: { name: true } },
        project: { select: { name: true, client: { select: { name: true } } } },
        department: { select: { name: true } },
      },
    });

    const esc = (s: unknown) => {
      const str = String(s ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = [
      ["Code", "Title", "Status", "Priority", "Assignee", "Creator", "Project", "Client", "Department", "Gain", "Outcome", "Due", "Created", "Completed"],
      ...tasks.map((t) => [
        esc(t.code), esc(t.title), esc(t.status), esc(t.priority),
        esc(t.assignee?.name ?? ""), esc(t.creator?.name ?? ""),
        esc(t.project?.name ?? ""), esc(t.project?.client?.name ?? ""),
        esc(t.department?.name ?? ""), esc(t.gainLever ?? ""), esc(t.outcome ?? ""),
        esc(t.dueDate?.toISOString() ?? ""), esc(t.createdAt.toISOString()), esc(t.completedAt?.toISOString() ?? ""),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");

    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tasks-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}