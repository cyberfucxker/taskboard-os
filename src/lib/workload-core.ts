import { canViewAnyDept, type Viewer } from "@/lib/dept-access";

/**
 * TaskBoard 3 Lane I - Workload guard, PURE half (no DB, no session, no clock reads).
 * Everything here is unit-tested in tests/workload.test.ts. The DB loaders live in
 * src/lib/workload.ts and feed these functions.
 *
 * Read-only by design: nothing in the workload guard writes, notifies or blocks.
 */

/** A person should not have more than this many tasks IN_PROGRESS (matches the focus-block cap). */
export const WIP_LIMIT = 3;

/** Overload thresholds. A person is "overloaded" when ANY of these is exceeded. */
export const OVERLOAD_THRESHOLDS = {
  /** more than this many tasks IN_PROGRESS (so a 4th is overload) */
  inProgressOver: WIP_LIMIT,
  /** planned work exceeds capacity by MORE than this many minutes */
  overcommitOverMin: 60,
  /** this many overdue open tasks or more */
  overdueAtLeast: 3,
} as const;

export type WorkloadStatus = "overloaded" | "no-plan" | "idle" | "ok";

export const STATUS_LABEL: Record<WorkloadStatus, string> = {
  overloaded: "Overloaded",
  "no-plan": "No plan yet",
  idle: "Idle",
  ok: "On track",
};

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** A task as the workload maths sees it. Dates are epoch ms so the shape is JSON/hydration safe. */
export interface WTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  blocked: boolean;
  dueMs: number | null;
  createdMs: number;
  estimateMin: number | null;
}

export const isBlocked = (t: Pick<WTask, "status" | "blocked">) => t.status === "BLOCKED" || t.blocked;

export function isOverdue(t: Pick<WTask, "dueMs">, todayStartMs: number): boolean {
  return t.dueMs !== null && t.dueMs < todayStartMs;
}

export function isDueToday(t: Pick<WTask, "dueMs">, todayStartMs: number): boolean {
  return t.dueMs !== null && t.dueMs >= todayStartMs && t.dueMs < todayStartMs + DAY_MS;
}

/**
 * Suggested working order: overdue first, then priority P0..P3, then due date (soonest,
 * undated last), then oldest created. Blocked tasks go last (they cannot be worked).
 * Returns task ids. Stable and deterministic (final tie-break on id).
 */
export function suggestedOrder(tasks: WTask[], todayStartMs: number): string[] {
  return [...tasks]
    .sort((a, b) => {
      const ba = isBlocked(a) ? 1 : 0;
      const bb = isBlocked(b) ? 1 : 0;
      if (ba !== bb) return ba - bb;
      const oa = isOverdue(a, todayStartMs) ? 0 : 1;
      const ob = isOverdue(b, todayStartMs) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const pa = PRIORITY_RANK[a.priority] ?? 9;
      const pb = PRIORITY_RANK[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = a.dueMs ?? Number.POSITIVE_INFINITY;
      const db = b.dueMs ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da < db ? -1 : 1;
      if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs;
      return a.id < b.id ? -1 : 1;
    })
    .map((t) => t.id);
}

/** Minutes of planned work beyond capacity (never negative). */
export function overcommitMinutes(plannedMinutes: number, capacityMinutes: number): number {
  return Math.max(0, Math.round(plannedMinutes - capacityMinutes));
}

/** Status label. Order of precedence: overloaded, no-plan, idle, ok. */
export function workloadStatus(a: {
  inProgressCount: number;
  overcommitMinutes: number;
  overdueCount: number;
  workingDayStarted: boolean;
  hasPlanToday: boolean;
  hasOpenSession: boolean;
}): WorkloadStatus {
  if (
    a.inProgressCount > OVERLOAD_THRESHOLDS.inProgressOver ||
    a.overcommitMinutes > OVERLOAD_THRESHOLDS.overcommitOverMin ||
    a.overdueCount >= OVERLOAD_THRESHOLDS.overdueAtLeast
  ) {
    return "overloaded";
  }
  if (a.workingDayStarted && !a.hasPlanToday) return "no-plan";
  if (a.workingDayStarted && !a.hasOpenSession && a.inProgressCount === 0) return "idle";
  return "ok";
}

export interface WorkloadInput {
  employeeId: string;
  /** Open (not DONE, not deleted/archived) tasks the person is on (assignee or co-assignee). */
  tasks: WTask[];
  /** Task ids the person ranked for today: plan slots 1..3 in slot order, then focus-block ids not already listed. */
  rankedIds: string[];
  focusBlockActive: boolean;
  /** A focus block was opened today (even if already ended) or a plan slot exists today. */
  hasPlanToday: boolean;
  hasOpenSession: boolean;
  capacityMinutes: number;
  /** IST 00:00 today in epoch ms. */
  todayStartMs: number;
  /** Mon-Sat, between shift start and shift end IST. */
  workingDayStarted: boolean;
}

export interface PersonWorkload {
  employeeId: string;
  inProgressCount: number;
  focusBlockActive: boolean;
  plannedMinutes: number;
  capacityMinutes: number;
  overcommitMinutes: number;
  /** Tasks that are effectively on today's plate (in progress / due today / overdue) but not ranked. */
  unrankedCount: number;
  overdueCount: number;
  dueTodayCount: number;
  /** Planned tasks with no estimate (they count as 0 minutes, so the plan may be under-stated). */
  unestimatedCount: number;
  hasPlanToday: boolean;
  suggestedOrder: string[];
  status: WorkloadStatus;
}

/**
 * Derive one person's workload.
 *
 * "Planned" for today = the ranked tasks (plan slots + focus block) UNION everything that is
 * effectively on their plate today: IN_PROGRESS, overdue, or due today (blocked tasks excluded -
 * they cannot be worked). So ranking 3 easy tasks cannot hide 4 hours of overdue work.
 */
export function computeWorkload(i: WorkloadInput): PersonWorkload {
  const open = i.tasks.filter((t) => t.status !== "DONE");
  const byId = new Map(open.map((t) => [t.id, t]));
  const rankedSet = new Set(i.rankedIds.filter((id) => byId.has(id)));

  const implied = open.filter(
    (t) => !isBlocked(t) && (t.status === "IN_PROGRESS" || isOverdue(t, i.todayStartMs) || isDueToday(t, i.todayStartMs)),
  );
  const planned = new Map<string, WTask>();
  for (const id of rankedSet) {
    const t = byId.get(id)!;
    if (!isBlocked(t)) planned.set(id, t);
  }
  for (const t of implied) planned.set(t.id, t);

  let plannedMinutes = 0;
  let unestimated = 0;
  for (const t of planned.values()) {
    if (t.estimateMin === null || t.estimateMin <= 0) unestimated += 1;
    else plannedMinutes += t.estimateMin;
  }
  plannedMinutes = Math.round(plannedMinutes);

  const inProgressCount = open.filter((t) => t.status === "IN_PROGRESS").length;
  const overdueCount = open.filter((t) => isOverdue(t, i.todayStartMs)).length;
  const dueTodayCount = open.filter((t) => isDueToday(t, i.todayStartMs)).length;
  const unrankedCount = implied.filter((t) => !rankedSet.has(t.id)).length;
  const over = overcommitMinutes(plannedMinutes, i.capacityMinutes);

  return {
    employeeId: i.employeeId,
    inProgressCount,
    focusBlockActive: i.focusBlockActive,
    plannedMinutes,
    capacityMinutes: i.capacityMinutes,
    overcommitMinutes: over,
    unrankedCount,
    overdueCount,
    dueTodayCount,
    unestimatedCount: unestimated,
    hasPlanToday: i.hasPlanToday,
    suggestedOrder: suggestedOrder(open, i.todayStartMs),
    status: workloadStatus({
      inProgressCount,
      overcommitMinutes: over,
      overdueCount,
      workingDayStarted: i.workingDayStarted,
      hasPlanToday: i.hasPlanToday,
      hasOpenSession: i.hasOpenSession,
    }),
  };
}

// ---- authorization (COO department isolation rule) -----------------------------------------

/** Roles that see their OWN department's whole team (never another department's). */
export const WORKLOAD_LEAD_ROLES: ReadonlySet<string> = new Set(["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "HR"]);

export type WorkloadAccess = "none" | "mine" | "all";

/**
 * What may `viewer` see of department `dept`?
 *  - SUPER_ADMIN / Leadership members (canViewAnyDept): every person in every department ("all").
 *  - Own department: head / team lead / HR see the whole team ("all"); everyone else only themselves ("mine").
 *  - Any other department: nothing ("none"). A Dev head cannot read Design.
 */
export function workloadAccess(viewer: Viewer, dept: { id: string }): WorkloadAccess {
  if (canViewAnyDept(viewer)) return "all";
  if (viewer.departmentId !== null && viewer.departmentId === dept.id) {
    return WORKLOAD_LEAD_ROLES.has(viewer.role) ? "all" : "mine";
  }
  return "none";
}

/** A requested scope can only narrow what the viewer is allowed, never widen it. */
export function effectiveAccess(requested: "mine" | "all", access: WorkloadAccess): WorkloadAccess {
  if (access === "none") return "none";
  return requested === "mine" ? "mine" : access;
}

/** May `viewer` read this one person's workload? Self always; otherwise via their department's access. */
export function canViewPersonWorkload(viewer: Viewer, target: { id: string; departmentId: string | null }): boolean {
  if (viewer.id === target.id) return true;
  if (canViewAnyDept(viewer)) return true;
  if (target.departmentId === null) return false;
  return workloadAccess(viewer, { id: target.departmentId }) === "all";
}

/** Cross-department roll-up: SUPER_ADMIN and Leadership only. */
export function canViewLeadershipWorkload(viewer: Viewer): boolean {
  return canViewAnyDept(viewer);
}

// ---- tiny pure formatters (client + server safe, no locale / clock) ------------------------

/** 130 -> "2h 10m", 45 -> "45m", 120 -> "2h", 0 -> "0m". */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Shape the client sends/receives for the "my workload" payload. */
export interface WorkloadTaskView {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  blocked: boolean;
  overdue: boolean;
  dueMs: number | null;
  estimateMin: number | null;
}

export interface MyWorkloadPayload {
  workload: PersonWorkload;
  /** Open tasks in suggestedOrder (capped). */
  tasks: WorkloadTaskView[];
  /** Currently IN_PROGRESS tasks (for the WIP guard). */
  inProgress: { id: string; code: string; title: string }[];
}

export interface DeptWorkloadRow extends PersonWorkload {
  name: string;
  title: string | null;
  departmentId: string | null;
}

export interface LeadershipDeptSummary {
  departmentId: string;
  name: string;
  slug: string;
  people: number;
  overloaded: number;
  noPlan: number;
  idle: number;
  ok: number;
}
