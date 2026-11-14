import { prisma } from "@/lib/db";
import type { Viewer } from "@/lib/dept-access";
import {
  DAY_GOAL_MS, SHIFT_END_MIN, SHIFT_START_MIN,
  istDateKey, istDayOfWeek, istDayStart, istMin,
} from "@/lib/time";
import {
  canViewLeadershipWorkload, canViewPersonWorkload, computeWorkload, effectiveAccess, workloadAccess,
  type DeptWorkloadRow, type LeadershipDeptSummary, type MyWorkloadPayload, type PersonWorkload,
  type WTask, type WorkloadInput, type WorkloadStatus,
} from "@/lib/workload-core";

export * from "@/lib/workload-core";

/**
 * TaskBoard 3 Lane I - Workload guard, DB half. READ-ONLY: no writes, no notifications.
 * Pure rules (thresholds, ordering, authorization) live in workload-core.ts.
 */

export class WorkloadAccessError extends Error {
  status: number;
  constructor(message = "Forbidden - your access does not cover this", status = 403) {
    super(message);
    this.name = "WorkloadAccessError";
    this.status = status;
  }
}

/**
 * Capacity for one working day, in minutes. Source: the existing day goal in lib/time.ts
 * (DAY_GOAL_MS = 8 productive hours; the 13:30-14:10 break is already outside it - the shift is
 * 09:30-18:30 = 9h minus the 40m break), scaled down for part-timers via
 * Employee.weeklyCapacityHrs / 5 (the same field the CORE-05.6 capacity-aware load view uses).
 */
export function dailyCapacityMinutes(weeklyCapacityHrs: number | null | undefined): number {
  const goal = Math.round(DAY_GOAL_MS / 60000);
  if (weeklyCapacityHrs === null || weeklyCapacityHrs === undefined || !(weeklyCapacityHrs > 0)) return goal;
  return Math.min(goal, Math.round((weeklyCapacityHrs / 5) * 60));
}

/** Mon-Sat, between shift start and shift end (IST). Sunday is a rest day. */
export function isWorkingDayStarted(now: Date): boolean {
  if (istDayOfWeek(now) === 0) return false;
  const m = istMin(now);
  return m >= SHIFT_START_MIN && m < SHIFT_END_MIN;
}

type LoadedInputs = { inputs: Map<string, WorkloadInput>; tasksByEmp: Map<string, WTask[]> };

const ACTIVE_EMPLOYEE = { deletedAt: null, status: { not: "EXITED" as const } };

/** Batch-load everything the maths needs for these employees (6 queries total, any headcount). */
async function loadInputs(
  people: { id: string; weeklyCapacityHrs: number | null }[], now: Date,
): Promise<LoadedInputs> {
  const ids = people.map((p) => p.id);
  const todayStart = istDayStart(now);
  const dateStr = istDateKey(now);
  const db = prisma as any; // TodayCommitment / FocusBlock delegates, same cast style as the plan API

  const [tasks, commitments, blocks, sessions] = ids.length === 0 ? [[], [], [], []] : await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null, archivedAt: null, status: { not: "DONE" },
        OR: [{ assigneeId: { in: ids } }, { assignees: { some: { employeeId: { in: ids } } } }],
      },
      select: {
        id: true, code: true, title: true, status: true, priority: true, blocked: true,
        dueDate: true, createdAt: true, estimateHrs: true, assigneeId: true,
        assignees: { select: { employeeId: true } },
      },
      take: 8000,
    }),
    db.todayCommitment.findMany({ where: { employeeId: { in: ids }, dateStr }, orderBy: { slot: "asc" } }) as Promise<
      { employeeId: string; taskId: string; slot: number }[]
    >,
    db.focusBlock.findMany({
      where: { employeeId: { in: ids }, OR: [{ endedAt: null }, { startedAt: { gte: todayStart } }] },
      orderBy: { startedAt: "desc" },
    }) as Promise<{ employeeId: string; taskIds: string[]; endedAt: Date | null }[]>,
    prisma.taskWorkSession.findMany({ where: { assigneeId: { in: ids }, endedAt: null }, select: { assigneeId: true } }),
  ]);

  const idSet = new Set(ids);
  const tasksByEmp = new Map<string, WTask[]>(ids.map((id) => [id, []]));
  for (const t of tasks) {
    const view: WTask = {
      id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority, blocked: t.blocked,
      dueMs: t.dueDate ? t.dueDate.getTime() : null,
      createdMs: t.createdAt.getTime(),
      estimateMin: t.estimateHrs !== null && t.estimateHrs !== undefined ? Math.round(t.estimateHrs * 60) : null,
    };
    const owners = new Set<string>();
    if (t.assigneeId && idSet.has(t.assigneeId)) owners.add(t.assigneeId);
    for (const a of t.assignees) if (idSet.has(a.employeeId)) owners.add(a.employeeId);
    for (const o of owners) tasksByEmp.get(o)!.push(view);
  }

  const planByEmp = new Map<string, string[]>();
  for (const c of commitments) planByEmp.set(c.employeeId, [...(planByEmp.get(c.employeeId) ?? []), c.taskId]);
  const openBlock = new Map<string, string[]>();
  const blockToday = new Set<string>();
  for (const b of blocks) {
    blockToday.add(b.employeeId);
    if (b.endedAt === null && !openBlock.has(b.employeeId)) openBlock.set(b.employeeId, b.taskIds);
  }
  const sessionOwners = new Set(sessions.map((s) => s.assigneeId));
  const started = isWorkingDayStarted(now);

  const inputs = new Map<string, WorkloadInput>();
  for (const p of people) {
    const ranked = [...(planByEmp.get(p.id) ?? [])];
    for (const id of openBlock.get(p.id) ?? []) if (!ranked.includes(id)) ranked.push(id);
    inputs.set(p.id, {
      employeeId: p.id,
      tasks: tasksByEmp.get(p.id) ?? [],
      rankedIds: ranked,
      focusBlockActive: openBlock.has(p.id),
      hasPlanToday: planByEmp.has(p.id) || blockToday.has(p.id),
      hasOpenSession: sessionOwners.has(p.id),
      capacityMinutes: dailyCapacityMinutes(p.weeklyCapacityHrs),
      todayStartMs: todayStart.getTime(),
      workingDayStarted: started,
    });
  }
  return { inputs, tasksByEmp };
}

/**
 * One person's workload. NO authorization here - callers that take a user-supplied id must
 * go through getPersonWorkloadFor(). Includes suggestedOrder (task ids).
 */
export async function getPersonWorkload(employeeId: string, now = new Date()): Promise<PersonWorkload> {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, weeklyCapacityHrs: true } });
  if (!emp) throw new WorkloadAccessError("Person not found", 404);
  const { inputs } = await loadInputs([emp], now);
  return computeWorkload(inputs.get(emp.id)!);
}

/** The signed-in person's own detail: workload + titled tasks in suggested order + their IN_PROGRESS list. */
export async function getMyWorkload(employeeId: string, now = new Date()): Promise<MyWorkloadPayload> {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, weeklyCapacityHrs: true } });
  if (!emp) throw new WorkloadAccessError("Person not found", 404);
  const { inputs, tasksByEmp } = await loadInputs([emp], now);
  const input = inputs.get(emp.id)!;
  const workload = computeWorkload(input);
  const byId = new Map((tasksByEmp.get(emp.id) ?? []).map((t) => [t.id, t]));
  const tasks = workload.suggestedOrder.slice(0, 25).flatMap((id) => {
    const t = byId.get(id);
    if (!t) return [];
    return [{
      id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority, blocked: t.blocked || t.status === "BLOCKED",
      overdue: t.dueMs !== null && t.dueMs < input.todayStartMs, dueMs: t.dueMs, estimateMin: t.estimateMin,
    }];
  });
  const inProgress = (tasksByEmp.get(emp.id) ?? []).filter((t) => t.status === "IN_PROGRESS").map((t) => ({ id: t.id, code: t.code, title: t.title }));
  return { workload, tasks, inProgress };
}

/** Authorized variant for user-supplied employee ids. */
export async function getPersonWorkloadFor(viewer: Viewer, employeeId: string, now = new Date()): Promise<PersonWorkload> {
  if (viewer.id !== employeeId) {
    const target = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, departmentId: true } });
    if (!target || !canViewPersonWorkload(viewer, target)) throw new WorkloadAccessError();
  }
  return getPersonWorkload(employeeId, now);
}

const SEVERITY: Record<WorkloadStatus, number> = { overloaded: 0, "no-plan": 1, idle: 2, ok: 3 };

/**
 * Workload of the people in ONE department. `requested` ("mine" | "all") can only narrow what the
 * viewer is allowed (see workloadAccess): a member asking for "all" still gets just themselves,
 * a Dev head asking for Design gets a 403. Rows carry counts only - no task titles or ids of
 * the work itself (suggestedOrder is blanked) - so a leader sees load, not other people's tasks.
 */
export async function getDepartmentWorkload(
  departmentId: string, viewer: Viewer, requested: "mine" | "all" = "all", now = new Date(),
): Promise<DeptWorkloadRow[]> {
  const dept = await prisma.department.findFirst({ where: { id: departmentId, deletedAt: null }, select: { id: true } });
  if (!dept) throw new WorkloadAccessError("Department not found", 404);
  const access = effectiveAccess(requested, workloadAccess(viewer, dept));
  if (access === "none") throw new WorkloadAccessError();

  const people = await prisma.employee.findMany({
    where: { departmentId: dept.id, ...ACTIVE_EMPLOYEE, ...(access === "mine" ? { id: viewer.id } : {}) },
    select: { id: true, name: true, title: true, weeklyCapacityHrs: true, departmentId: true },
  });
  const { inputs } = await loadInputs(people, now);
  return people
    .map((p) => ({ ...computeWorkload(inputs.get(p.id)!), suggestedOrder: [], name: p.name, title: p.title, departmentId: p.departmentId }))
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.name.localeCompare(b.name));
}

/** Cross-department roll-up of status counts. SUPER_ADMIN and Leadership members only. */
export async function getLeadershipWorkload(viewer: Viewer, now = new Date()): Promise<LeadershipDeptSummary[]> {
  if (!canViewLeadershipWorkload(viewer)) throw new WorkloadAccessError();
  const [depts, people] = await Promise.all([
    prisma.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { ...ACTIVE_EMPLOYEE, departmentId: { not: null } },
      select: { id: true, weeklyCapacityHrs: true, departmentId: true },
    }),
  ]);
  const { inputs } = await loadInputs(people, now);
  return depts.map((d) => {
    const s: LeadershipDeptSummary = { departmentId: d.id, name: d.name, slug: d.slug, people: 0, overloaded: 0, noPlan: 0, idle: 0, ok: 0 };
    for (const p of people) {
      if (p.departmentId !== d.id) continue;
      const w = computeWorkload(inputs.get(p.id)!);
      s.people += 1;
      if (w.status === "overloaded") s.overloaded += 1;
      else if (w.status === "no-plan") s.noPlan += 1;
      else if (w.status === "idle") s.idle += 1;
      else s.ok += 1;
    }
    return s;
  });
}
