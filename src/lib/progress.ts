import { prisma } from "@/lib/db";
import type { ScopedSession } from "@/lib/scope";
import { istDayStart, istDateKey } from "@/lib/time";

/**
 * Progress / Leaderboard — mirrors the legacy task tool reports snapshot.
 *
 * Productivity leaderboard: every non-`SUPER_ADMIN` employee who has tasks is
 * ranked by **% of assigned tasks completed** (matching the old
 * `productivityByEmployee` computation). Admins/leads see everyone; a regular
 * employee sees only their own numbers (same scoping as the old app).
 */

const TREND_DAYS = 14;

function startOfDay(d: Date): Date {
  return istDayStart(d);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
const isoDay = (d: Date) => istDateKey(d);

/** RAII scope: leads/admins see the whole org, everyone else sees only self. */
function scopeWhere(session: ScopedSession) {
  if (
    session.user.role === "SUPER_ADMIN" ||
    session.user.role === "DEPARTMENT_HEAD" ||
    session.user.role === "TEAM_LEAD"
  ) {
    return { scopeAll: true, where: {} as Record<string, unknown> };
  }
  return { scopeAll: false, where: { assigneeId: session.user.id } };
}

export interface ProgressSnapshot {
  scopeAll: boolean;
  trend: { date: string; count: number }[];
  priority: Record<string, number>;
  hours: { client: string; estimated: number; actual: number }[];
  leaderboard: {
    employeeId: string | null;
    name: string;
    dept: string | null;
    deptColor: string | null;
    total: number;
    done: number;
    completionPercent: number;
  }[];
}

export async function getProgress(session: ScopedSession): Promise<ProgressSnapshot> {
  const { scopeAll, where } = scopeWhere(session);

  // 14-day completion trend (migrated tasks carry completedAt for DONE)
  const today = startOfDay(new Date());
  const rangeStart = addDays(today, -(TREND_DAYS - 1));
  const rangeEnd = addDays(today, 1);
  const doneTasks = await prisma.task.findMany({
    where: { ...where, status: "DONE", completedAt: { gte: rangeStart, lt: rangeEnd } },
    select: { completedAt: true },
  });
  const byDay = new Map<string, number>();
  for (const t of doneTasks) {
    if (!t.completedAt) continue;
    const k = isoDay(startOfDay(t.completedAt));
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const trend: ProgressSnapshot["trend"] = [];
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = addDays(rangeStart, i);
    trend.push({ date: isoDay(d), count: byDay.get(isoDay(d)) ?? 0 });
  }

  // Priority distribution
  const priGroups = await prisma.task.groupBy({
    by: ["priority"], where, _count: { _all: true },
  });
  const priority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const g of priGroups) priority[g.priority] = g._count._all;

  // Hours by client
  const hourGroups = await prisma.task.groupBy({
    by: ["clientId"], where, _sum: { estimateHrs: true, actualHrs: true },
  });
  const clientIds = hourGroups.filter((g) => g.clientId).map((g) => g.clientId as string);
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } }, select: { id: true, name: true },
  });
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  const hours = hourGroups.map((g) => ({
    client: (g.clientId && nameById.get(g.clientId)) || "Unassigned",
    estimated: g._sum.estimateHrs ?? 0,
    actual: g._sum.actualHrs ?? 0,
  }));

  // Leaderboard — ranks employees via the TaskAssignee join table (multi-assignee aware)
  let leaderboard: ProgressSnapshot["leaderboard"] = [];
  if (scopeAll) {
    // Get all active task IDs first
    const activeTasks = await prisma.task.findMany({
      where: { deletedAt: null },
      select: { id: true, status: true },
    });
    const activeTaskIds = activeTasks.map((t) => t.id);
    const doneTaskIds = activeTasks.filter((t) => t.status === "DONE").map((t) => t.id);

    // Count tasks per employee via the join table
    const [totalAssignees, doneAssignees] = await Promise.all([
      prisma.taskAssignee.groupBy({
        by: ["employeeId"],
        where: { taskId: { in: activeTaskIds } },
        _count: { _all: true },
      }),
      prisma.taskAssignee.groupBy({
        by: ["employeeId"],
        where: { taskId: { in: doneTaskIds } },
        _count: { _all: true },
      }),
    ]);
    const empIds = totalAssignees.map((g) => g.employeeId);
    const emps = await prisma.employee.findMany({
      where: { id: { in: empIds }, role: { not: "SUPER_ADMIN" }, deletedAt: null },
      select: { id: true, name: true, departmentId: true },
    });

    // Fetch departments separately
    const deptIds = new Set(emps.map((e) => e.departmentId).filter(Boolean) as string[]);
    const depts = await prisma.department.findMany({
      where: { id: { in: Array.from(deptIds) } },
      select: { id: true, name: true, color: true },
    });
    const deptMap = new Map(depts.map((d) => [d.id, d]));

    const empById = new Map(emps.map((e) => [e.id, { ...e, department: e.departmentId ? deptMap.get(e.departmentId) : null }]));
    const doneByEmp = new Map(doneAssignees.map((g) => [g.employeeId, g._count._all]));
    leaderboard = totalAssignees
      .filter((g) => empById.has(g.employeeId))
      .map((g) => {
        const emp = empById.get(g.employeeId)!;
        const total = g._count._all;
        const done = doneByEmp.get(g.employeeId) ?? 0;
        return {
          employeeId: g.employeeId,
          name: emp.name,
          dept: emp.department?.name ?? null,
          deptColor: emp.department?.color ?? null,
          total,
          done,
          completionPercent: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.completionPercent - a.completionPercent);
  } else {
    // Self view — count via join table
    const [total, done] = await Promise.all([
      prisma.taskAssignee.count({
        where: { employeeId: session.user.id, task: { deletedAt: null } },
      }),
      prisma.taskAssignee.count({
        where: { employeeId: session.user.id, task: { deletedAt: null, status: "DONE" } },
      }),
    ]);
    const me = await prisma.employee.findUnique({
      where: { id: session.user.id },
      select: { name: true, department: { select: { name: true, color: true } } },
    });
    leaderboard = [
      {
        employeeId: session.user.id,
        name: me?.name ?? "You",
        dept: me?.department?.name ?? null,
        deptColor: me?.department?.color ?? null,
        total,
        done,
        completionPercent: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
      },
    ];
  }

  return { scopeAll, trend, priority, hours, leaderboard };
}
