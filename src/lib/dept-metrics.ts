import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addIstDays, istDateKey, istDayOfWeek, istDayStart } from "@/lib/time";
import type { DeptScope } from "@/components/dept/types";
import { acrossDeptWhere, ownDeptWhere } from "@/lib/dept-access";

/**
 * Department dashboard metrics (TaskBoard 3, Lane C). READ-ONLY, server-side.
 * Every query is scoped by departmentId, and by the viewer when scope === "mine".
 * No rates, salaries or revenue are read here.
 */

// ---- helpers ---------------------------------------------------------------

export interface DeptInfo {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export const getDeptById = cache(async (id: string): Promise<DeptInfo | null> =>
  prisma.department.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, slug: true, color: true },
  }),
);

export const getDeptBySlug = cache(async (slug: string): Promise<DeptInfo | null> =>
  prisma.department.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, name: true, slug: true, color: true },
  }),
);

/** Run a metric; never throw into the render. */
export async function safe<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: boolean }> {
  try {
    return { data: await fn(), error: false };
  } catch (e) {
    console.error("[dept-metrics]", e);
    return { data: null, error: true };
  }
}

/** IST calendar anchors. Week = Monday..Sunday in IST. */
export function anchors(now = new Date()) {
  const today = istDayStart(now);
  const dow = istDayOfWeek(now); // 0 = Sunday
  const weekStart = addIstDays(today, -((dow + 6) % 7));
  return { now, today, tomorrow: addIstDays(today, 1), weekStart, weekEnd: addIstDays(weekStart, 7) };
}

export function ageDays(from: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86400000));
}

const scoped = ownDeptWhere;
const OPEN: Prisma.TaskWhereInput = { status: { not: "DONE" } };
const BLOCKED_ANY: Prisma.TaskWhereInput = { OR: [{ status: "BLOCKED" }, { blocked: true }] };

/**
 * Link into /tasks. Only filters the Tasks board really reads are emitted:
 * dept (department NAME), assignee (id | "me"), dueAfter / dueBefore (YYYY-MM-DD).
 * `status` and `clientId` are NOT read by the board yet - flip the flags below
 * when the Tasks lane ships them and every tile starts narrowing.
 */
export const TASKS_SUPPORTS_STATUS = false;
export const TASKS_SUPPORTS_CLIENT = false;

export function tasksHref(o: {
  deptName: string;
  scope: DeptScope;
  status?: string;
  clientId?: string | null;
  dueAfter?: Date;
  dueBefore?: Date;
}): string {
  const q = new URLSearchParams();
  q.set("dept", o.deptName);
  if (o.scope === "mine") q.set("assignee", "me");
  if (o.dueAfter) q.set("dueAfter", istDateKey(o.dueAfter));
  if (o.dueBefore) q.set("dueBefore", istDateKey(o.dueBefore));
  if (TASKS_SUPPORTS_STATUS && o.status) q.set("status", o.status);
  if (TASKS_SUPPORTS_CLIENT && o.clientId) q.set("clientId", o.clientId);
  return `/tasks?${q.toString()}`;
}

// ---- stat tiles -------------------------------------------------------------

export interface StatTileData {
  label: string;
  value: string;
  hint?: string;
  href: string;
  tone?: "default" | "warn" | "bad" | "good";
}

export type DeptKind = "dev" | "design" | "dm" | "generic";

export async function deptStats(
  kind: DeptKind, dept: DeptInfo, scope: DeptScope, userId: string, canSeeLeads: boolean,
): Promise<StatTileData[]> {
  const { today, weekStart, weekEnd, now } = anchors();
  const w = (extra?: Prisma.TaskWhereInput) => scoped(dept.id, scope, userId, extra);
  const href = (o: Partial<Parameters<typeof tasksHref>[0]> = {}) => tasksHref({ deptName: dept.name, scope, ...o });

  const [open, overdue, blocked, inReview, dueWeek, doneWeek, rework, hours] = await Promise.all([
    prisma.task.count({ where: w(OPEN) }),
    prisma.task.count({ where: w({ ...OPEN, dueDate: { lt: today } }) }),
    prisma.task.count({ where: w({ AND: [OPEN, BLOCKED_ANY] }) }),
    prisma.task.count({ where: w({ status: "IN_REVIEW" }) }),
    prisma.task.count({ where: w({ ...OPEN, dueDate: { gte: today, lt: weekEnd } }) }),
    prisma.task.count({ where: w({ status: "DONE", completedAt: { gte: weekStart } }) }),
    prisma.task.count({ where: w({ ...OPEN, reworkReason: { not: null } }) }),
    prisma.timeLog.aggregate({
      _sum: { hours: true },
      where: { date: { gte: weekStart, lt: weekEnd }, task: { departmentId: dept.id }, ...(scope === "mine" ? { employeeId: userId } : {}) },
    }),
  ]);
  const hrs = Math.round((hours._sum.hours ?? 0) * 10) / 10;

  const tOpen: StatTileData = { label: "Open", value: String(open), href: href() };
  const tOverdue: StatTileData = {
    label: "Overdue", value: String(overdue), href: href({ dueBefore: new Date(today.getTime() - 86400000) }),
    tone: overdue > 0 ? "bad" : "good", hint: overdue > 0 ? "past due date" : "none late",
  };
  const tBlocked: StatTileData = {
    label: "Blocked", value: String(blocked), href: href({ status: "BLOCKED" }), tone: blocked > 0 ? "bad" : "good",
  };
  const tReview: StatTileData = {
    label: "In review", value: String(inReview), href: href({ status: "IN_REVIEW" }), tone: inReview > 0 ? "warn" : "default",
  };
  const tDue: StatTileData = { label: "Due this week", value: String(dueWeek), href: href({ dueAfter: today, dueBefore: addIstDays(weekEnd, -1) }) };
  const tDone: StatTileData = { label: "Done this week", value: String(doneWeek), href: href({ status: "DONE" }), tone: "good" };
  const tHours: StatTileData = { label: "Hours this week", value: String(hrs), hint: "logged", href: "/time" };

  if (kind === "dev") return [tOpen, tReview, tBlocked, tHours];
  if (kind === "design") {
    return [tOpen, tReview, tDue, { label: "Revisions", value: String(rework), href: href(), tone: rework > 0 ? "warn" : "default", hint: "open reworks" }];
  }
  if (kind === "dm") {
    const leads = canSeeLeads ? await metaLeadTotal(scope, userId, now) : null;
    return [tDue, tOverdue, tOpen, leads === null
      ? tDone
      : { label: "Meta leads", value: String(leads), hint: "last 30 days", href: "/crm/leads" }];
  }
  return [tOpen, tOverdue, tBlocked, tDone];
}

// ---- status chart -----------------------------------------------------------

export interface StatusCount { status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE"; label: string; count: number }

export async function tasksByStatus(departmentId: string, scope: DeptScope, userId: string): Promise<StatusCount[]> {
  const { today } = anchors();
  const since = addIstDays(today, -7);
  const [rows, done] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], _count: { _all: true }, where: scoped(departmentId, scope, userId, OPEN) }),
    prisma.task.count({ where: scoped(departmentId, scope, userId, { status: "DONE", completedAt: { gte: since } }) }),
  ]);
  const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return [
    { status: "TODO", label: "To do", count: n("TODO") },
    { status: "IN_PROGRESS", label: "In progress", count: n("IN_PROGRESS") },
    { status: "IN_REVIEW", label: "In review", count: n("IN_REVIEW") },
    { status: "BLOCKED", label: "Blocked", count: n("BLOCKED") },
    { status: "DONE", label: "Done (7 days)", count: done },
  ];
}

// ---- task lists -------------------------------------------------------------

export interface TaskRow {
  id: string;
  code: string;
  title: string;
  assignee: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  dueDate: Date | null;
  ageDays: number;
  note: string | null;
}

const ROW_SELECT = {
  id: true, code: true, title: true, dueDate: true, updatedAt: true, blockerReason: true, reworkReason: true,
  assignee: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

type RowSrc = Prisma.TaskGetPayload<{ select: typeof ROW_SELECT }>;
const toRow = (t: RowSrc, note: string | null = null): TaskRow => ({
  id: t.id, code: t.code, title: t.title, assignee: t.assignee, client: t.client,
  dueDate: t.dueDate, ageDays: ageDays(t.updatedAt), note,
});

/** Blocked tasks, oldest first. Age = days since the task last changed (no blockedAt column). */
export async function blockedTasks(departmentId: string, scope: DeptScope, userId: string, take = 8): Promise<TaskRow[]> {
  const rows = await prisma.task.findMany({
    where: scoped(departmentId, scope, userId, { AND: [OPEN, BLOCKED_ANY] }),
    select: ROW_SELECT, orderBy: { updatedAt: "asc" }, take,
  });
  return rows.map((t) => toRow(t, t.blockerReason));
}

/** Review / approval queue, longest-waiting first. */
export async function reviewQueue(departmentId: string, scope: DeptScope, userId: string, take = 8): Promise<TaskRow[]> {
  const rows = await prisma.task.findMany({
    where: scoped(departmentId, scope, userId, { status: "IN_REVIEW" }),
    select: ROW_SELECT, orderBy: { updatedAt: "asc" }, take,
  });
  return rows.map((t) => toRow(t));
}

export async function dueThisWeek(departmentId: string, scope: DeptScope, userId: string, take = 8): Promise<TaskRow[]> {
  const { today, weekEnd } = anchors();
  const rows = await prisma.task.findMany({
    where: scoped(departmentId, scope, userId, { ...OPEN, dueDate: { gte: today, lt: weekEnd } }),
    select: ROW_SELECT, orderBy: { dueDate: "asc" }, take,
  });
  return rows.map((t) => toRow(t));
}

export async function overdueTasks(departmentId: string, scope: DeptScope, userId: string, take = 8): Promise<TaskRow[]> {
  const { today } = anchors();
  const rows = await prisma.task.findMany({
    where: scoped(departmentId, scope, userId, { ...OPEN, dueDate: { lt: today } }),
    select: ROW_SELECT, orderBy: { dueDate: "asc" }, take,
  });
  return rows.map((t) => toRow(t));
}

// ---- per client -------------------------------------------------------------

export interface ClientDue {
  clientId: string | null;
  clientName: string;
  due: number;
  overdue: number;
  nextDue: Date | null;
}

/** Open deliverables per client: overdue + due within the next `days` days. */
export async function deliverablesByClient(departmentId: string, scope: DeptScope, userId: string, days = 7): Promise<ClientDue[]> {
  const { today } = anchors();
  const horizon = addIstDays(today, days + 1);
  const rows = await prisma.task.findMany({
    where: scoped(departmentId, scope, userId, { ...OPEN, dueDate: { lt: horizon } }),
    select: { dueDate: true, client: { select: { id: true, name: true } } },
    take: 2000,
  });
  const map = new Map<string, ClientDue>();
  for (const r of rows) {
    const key = r.client?.id ?? "none";
    const c = map.get(key) ?? { clientId: r.client?.id ?? null, clientName: r.client?.name ?? "No client", due: 0, overdue: 0, nextDue: null };
    c.due += 1;
    if (r.dueDate && r.dueDate < today) c.overdue += 1;
    if (r.dueDate && (!c.nextDue || r.dueDate < c.nextDue)) c.nextDue = r.dueDate;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.overdue - a.overdue || b.due - a.due).slice(0, 10);
}

export interface ClientCount { clientId: string | null; clientName: string; count: number }

export async function overdueByClient(departmentId: string, scope: DeptScope, userId: string): Promise<ClientCount[]> {
  const { today } = anchors();
  const rows = await prisma.task.groupBy({
    by: ["clientId"], _count: { _all: true },
    where: scoped(departmentId, scope, userId, { ...OPEN, dueDate: { lt: today } }),
  });
  return namedCounts(rows.map((r) => ({ clientId: r.clientId, count: r._count._all })));
}

/** Open tasks carrying a rework reason, per client. */
export async function revisionsByClient(departmentId: string, scope: DeptScope, userId: string): Promise<ClientCount[]> {
  const rows = await prisma.task.groupBy({
    by: ["clientId"], _count: { _all: true },
    where: scoped(departmentId, scope, userId, { ...OPEN, reworkReason: { not: null } }),
  });
  return namedCounts(rows.map((r) => ({ clientId: r.clientId, count: r._count._all })));
}

async function namedCounts(rows: Array<{ clientId: string | null; count: number }>): Promise<ClientCount[]> {
  const ids = rows.map((r) => r.clientId).filter((x): x is string => !!x);
  const names = ids.length ? await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nm = new Map(names.map((c) => [c.id, c.name]));
  return rows
    .map((r) => ({ clientId: r.clientId, clientName: r.clientId ? nm.get(r.clientId) ?? "Client" : "No client", count: r.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// ---- people -----------------------------------------------------------------

export interface PersonLoad {
  id: string;
  name: string;
  title: string | null;
  open: number;
  overdue: number;
  estHrs: number;
  capacityHrs: number | null;
}

export async function personLoad(departmentId: string, scope: DeptScope, userId: string): Promise<PersonLoad[]> {
  const { today } = anchors();
  const [people, tasks] = await Promise.all([
    prisma.employee.findMany({
      where: { departmentId, deletedAt: null, status: { not: "EXITED" }, ...(scope === "mine" ? { id: userId } : {}) },
      select: { id: true, name: true, title: true, weeklyCapacityHrs: true },
    }),
    prisma.task.findMany({
      where: scoped(departmentId, scope, userId, { ...OPEN, assigneeId: { not: null } }),
      select: { assigneeId: true, estimateHrs: true, dueDate: true },
      take: 5000,
    }),
  ]);
  const by = new Map<string, { open: number; overdue: number; est: number }>();
  for (const t of tasks) {
    const a = by.get(t.assigneeId!) ?? { open: 0, overdue: 0, est: 0 };
    a.open += 1;
    if (t.dueDate && t.dueDate < today) a.overdue += 1;
    a.est += t.estimateHrs ?? 0;
    by.set(t.assigneeId!, a);
  }
  return people
    .map((p) => {
      const a = by.get(p.id) ?? { open: 0, overdue: 0, est: 0 };
      return { id: p.id, name: p.name, title: p.title, open: a.open, overdue: a.overdue, estHrs: Math.round(a.est * 10) / 10, capacityHrs: p.weeklyCapacityHrs };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

// ---- hours vs estimate ------------------------------------------------------

export interface HoursRow { taskId: string; code: string; title: string; weekHrs: number; totalHrs: number; estimateHrs: number | null }
export interface HoursSummary { weekHrs: number; rows: HoursRow[] }

/** Hours logged this IST week, and for each worked task the all-time logged vs its estimate. */
export async function hoursVsEstimate(departmentId: string, scope: DeptScope, userId: string): Promise<HoursSummary> {
  const { weekStart, weekEnd } = anchors();
  const logs = await prisma.timeLog.findMany({
    where: { date: { gte: weekStart, lt: weekEnd }, task: { departmentId, deletedAt: null }, ...(scope === "mine" ? { employeeId: userId } : {}) },
    select: { taskId: true, hours: true, task: { select: { code: true, title: true, estimateHrs: true } } },
    take: 5000,
  });
  const wk = new Map<string, HoursRow>();
  let weekHrs = 0;
  for (const l of logs) {
    weekHrs += l.hours;
    const r = wk.get(l.taskId) ?? { taskId: l.taskId, code: l.task.code, title: l.task.title, weekHrs: 0, totalHrs: 0, estimateHrs: l.task.estimateHrs };
    r.weekHrs += l.hours;
    wk.set(l.taskId, r);
  }
  const ids = [...wk.keys()];
  if (ids.length) {
    const totals = await prisma.timeLog.groupBy({ by: ["taskId"], _sum: { hours: true }, where: { taskId: { in: ids } } });
    for (const t of totals) { const r = wk.get(t.taskId); if (r) r.totalHrs = t._sum.hours ?? 0; }
  }
  const rows = [...wk.values()].sort((a, b) => b.weekHrs - a.weekHrs).slice(0, 7);
  return { weekHrs: Math.round(weekHrs * 10) / 10, rows };
}

// ---- Meta leads (CrmLead.adDetail) -----------------------------------------

export interface MetaLeadRow { campaign: string; form: string; leads: number }

function leadScopeSql(scope: DeptScope, userId: string): Prisma.Sql {
  return scope === "mine" ? Prisma.sql`AND "assignedUserId" = ${userId}` : Prisma.empty;
}

export async function metaLeadTotal(scope: DeptScope, userId: string, now = new Date()): Promise<number | null> {
  try {
    const since = new Date(now.getTime() - 30 * 86400000);
    const r = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "CrmLead"
      WHERE jsonb_typeof("adDetail") = 'object' AND "adDetail"->>'importError' IS NULL
        AND "createdAt" >= ${since} ${leadScopeSql(scope, userId)}`;
    return r[0]?.n ?? 0;
  } catch (e) {
    console.error("[dept-metrics] metaLeadTotal", e);
    return null;
  }
}

/** Meta lead-ad leads, last 30 days, grouped by campaign + form (read from CrmLead.adDetail). */
export async function metaLeadsByCampaign(scope: DeptScope, userId: string): Promise<MetaLeadRow[]> {
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await prisma.$queryRaw<Array<{ campaign: string | null; form: string | null; leads: number }>>`
    SELECT "adDetail"->>'campaignName' AS campaign, "adDetail"->>'formName' AS form, COUNT(*)::int AS leads
    FROM "CrmLead"
    WHERE jsonb_typeof("adDetail") = 'object' AND "adDetail"->>'importError' IS NULL
      AND "createdAt" >= ${since} ${leadScopeSql(scope, userId)}
    GROUP BY 1, 2 ORDER BY leads DESC LIMIT 8`;
  return rows.map((r) => ({ campaign: r.campaign ?? "(no campaign)", form: r.form ?? "(no form)", leads: r.leads }));
}

// ---- across departments -------------------------------------------------------

export interface AcrossRow {
  code: string;
  title: string;
  status: string;
  dueDate: Date | null;
  otherDept: string;
}

/**
 * Tasks owned by ANOTHER department that involve this department (see acrossDeptWhere).
 * Deliberately minimal: no people, hours, clients or ages - and never aggregated.
 */
export async function acrossDepartments(departmentId: string, scope: DeptScope, userId: string, take = 10): Promise<AcrossRow[]> {
  const rows = await prisma.task.findMany({
    where: acrossDeptWhere(departmentId, scope, userId),
    select: { code: true, title: true, status: true, dueDate: true, department: { select: { name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take,
  });
  return rows.map((t) => ({ code: t.code, title: t.title, status: t.status, dueDate: t.dueDate, otherDept: t.department?.name ?? "No department" }));
}
