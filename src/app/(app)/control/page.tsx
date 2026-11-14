import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/pages";
import { istWeekStart } from "@/lib/time";
import { prisma } from "@/lib/db";
import { ControlPanel } from "@/components/control/ControlPanel";
import { SectionLabel } from "@/components/ui";

export const metadata: Metadata = { title: "Control · Leadership" };
export const dynamic = "force-dynamic";

const LEADER_ROLES = ["SUPER_ADMIN", "DEPARTMENT_HEAD", "HR"];

/** Leadership control surface (view + inline actions).
 *  Gated on hrms.manage. Shows every employee's workload + every project's
 *  health, and lets leadership act (mark done / deep-link / nudge) from one pane. */
export default async function ControlPage() {
  const session = await guardPage("Control"); // auth + page grant
  if (!LEADER_ROLES.includes(session.user.role)) redirect("/workspace");

  const weekStart = istWeekStart(new Date());

  const employees = await prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "PROBATION"] } },
    select: {
      id: true, name: true, role: true,
      department: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    select: {
      id: true, code: true, title: true, status: true, blocked: true,
      blockerReason: true, updatedAt: true, completedAt: true,
      assigneeId: true, creatorId: true,
      project: { select: { id: true, name: true, client: { select: { name: true } }, status: true } },
      assignees: { include: { employee: { select: { id: true, name: true } } } },
    },
  });

  // Real per-employee weekly hours — this used to be a company-wide total
  // split proportionally by each employee's share of currently-open tasks,
  // which had no relationship to what they actually logged (someone who
  // worked overtime with few open tasks showed near-zero; someone idle with
  // many open tasks showed a large number). TaskWorkSession has a real
  // assigneeId to group on — use it.
  const weekSessionsByAssignee = await (prisma as any).taskWorkSession.groupBy({
    by: ["assigneeId"],
    where: { endedAt: { not: null, gte: weekStart } },
    _sum: { elapsedSec: true },
  });
  const weekSecByAssignee: Record<string, number> = {};
  for (const row of weekSessionsByAssignee) {
    if (row.assigneeId) weekSecByAssignee[row.assigneeId] = row._sum.elapsedSec ?? 0;
  }

  // ---------- per-employee aggregation ----------
  const empMap: Record<string, any> = {};
  for (const e of employees) {
    empMap[e.id] = {
      id: e.id, name: e.name, role: e.role, dept: e.department?.name ?? null,
      openTasks: 0, running: 0, doneWeek: 0, blocked: 0, weekHrs: "0.0",
      blockers: [],
    };
  }
  for (const t of tasks) {
    const who = [t.assigneeId, ...t.assignees.map((a) => a.employee.id)].filter(Boolean) as string[];
    for (const id of who) {
      const row = empMap[id]; if (!row) continue;
      if (t.status !== "DONE") row.openTasks++;
      if (t.status === "IN_PROGRESS") row.running++;
      if (t.status === "DONE" && t.completedAt && t.completedAt >= weekStart) row.doneWeek++;
      if (t.status === "BLOCKED") {
        row.blocked++;
        row.blockers.push({
          code: t.code, title: t.title, reason: t.blockerReason,
          since: t.updatedAt ? t.updatedAt.toLocaleDateString() : null,
        });
      }
    }
  }
  for (const id in empMap) {
    empMap[id].weekHrs = ((weekSecByAssignee[id] ?? 0) / 3600).toFixed(1);
  }
  const empList = Object.values(empMap).sort((a, b) => b.openTasks + b.blocked - (a.openTasks + a.blocked));

  // ---------- per-project aggregation ----------
  const projMap: Record<string, any> = {};
  for (const t of tasks) {
    if (!t.project) continue;
    const id = t.project.id;
    if (!projMap[id]) {
      projMap[id] = {
        id, name: t.project.name, client: t.project.client?.name ?? null,
        status: t.project.status, total: 0, done: 0, blocked: 0,
        members: [] as any[], memberIds: new Set<string>(), open: [] as any[],
      };
    }
    const p = projMap[id];
    p.total++;
    if (t.status === "DONE") p.done++;
    if (t.status === "BLOCKED") p.blocked++;
    for (const a of t.assignees) {
      if (!p.memberIds.has(a.employee.id)) {
        p.memberIds.add(a.employee.id);
        p.members.push({ id: a.employee.id, name: a.employee.name });
      }
    }
    if (t.status !== "DONE") {
      p.open.push({ id: t.id, code: t.code, title: t.title, status: t.status });
    }
  }
  const projList = Object.values(projMap)
    .map((p) => ({ ...p, members: p.members, open: p.open }))
    .sort((a, b) => (b.blocked + b.total - a.blocked - a.total) || b.blocked - a.blocked);

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-5">
        <SectionLabel>Leadership Control</SectionLabel>
        <h1 className="mt-1 text-xl font-semibold text-ink">Every employee · every project · one view</h1>
        <p className="text-[13px] text-muted">Total visibility. Deep-link or act inline; the employee never sees their own score.</p>
      </header>
      <ControlPanel employees={empList} projects={projList} />
    </main>
  );
}