import { prisma } from "@/lib/db";
import {
  denied, getActor, guarded, isLeadershipAudience, istToday, ok, STAFF_WHERE, TASK_OPEN_WHERE,
  type IstDay, type Result, type Scope,
} from "@/lib/dept-metrics-common";

/**
 * Leadership dashboard metrics: one row per department plus idle people and clients at risk.
 * Read-only, company-wide. Audience: SUPER_ADMIN or the Leadership department only (COO rule); everyone else is refused.
 * No money figures here (revenue lives in Finance), so no finance capability is needed.
 * `scope` is ignored: a roll-up has no "mine".
 *
 * Definitions (all IST):
 *   open     = not DONE, not deleted, not archived
 *   overdue  = open with a due date before today 00:00 IST
 *   blocked  = open with status BLOCKED or the blocked flag set
 *   idle     = working staff (not on leave) with no TaskWorkSession started today
 *              (or still running). Sundays are a week-off: idle is not reported.
 */

const NO_LEAD = "The company roll-up is for Leadership only.";

async function audience(userId: string): Promise<boolean> {
  const a = await getActor(userId);
  return !!a && isLeadershipAudience(a);
}

/** Employees expected to be working today (not on leave by status or by today's override). */
async function workingStaffToday(day: IstDay) {
  const [people, leaveOverrides] = await Promise.all([
    prisma.employee.findMany({
      where: { ...STAFF_WHERE, status: { in: ["ACTIVE", "PROBATION", "OVERLOADED"] } },
      select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
    }),
    prisma.attendanceOverride.findMany({
      where: { dateStr: day.key, status: { in: ["ON_LEAVE", "ABSENT"] } },
      select: { employeeId: true },
    }),
  ]);
  const away = new Set(leaveOverrides.map((o) => o.employeeId));
  return people.filter((p) => !away.has(p.id));
}

async function startedToday(ids: string[], day: IstDay): Promise<Set<string>> {
  const rows = await prisma.taskWorkSession.groupBy({
    by: ["assigneeId"],
    where: { assigneeId: { in: ids }, OR: [{ startedAt: { gte: day.start, lt: day.end } }, { endedAt: null }] },
  });
  return new Set(rows.map((r) => r.assigneeId));
}

/* ------------------------------------------------- Department roll-up */

export interface DeptRow {
  id: string;
  name: string;
  slug: string;
  people: number;
  open: number;
  overdue: number;
  blocked: number;
  /** null on a week-off day. */
  idle: number | null;
  /** /tasks filtered to this department (the Tasks board reads ?dept=<name>). */
  href: string;
  /** Same, narrowed to due on or before yesterday (the board reads ?dueBefore=yyyy-mm-dd). */
  overdueHref: string;
}
export interface DeptRollup { rows: DeptRow[]; weekOff: boolean; totals: { open: number; overdue: number; blocked: number; idle: number | null } }

export function departmentRollup(userId: string, _scope: Scope): Promise<Result<DeptRollup>> {
  return guarded("leadership.rollup", async () => {
    if (!(await audience(userId))) return denied(NO_LEAD);
    const day = istToday();
    const yesterday = new Date(day.start.getTime() - 1);
    const yKey = istToday(yesterday).key;
    const openWhere = { ...TASK_OPEN_WHERE, departmentId: { not: null } };

    const [depts, open, overdue, blocked, staff] = await Promise.all([
      prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
      prisma.task.groupBy({ by: ["departmentId"], where: openWhere, _count: { _all: true } }),
      prisma.task.groupBy({ by: ["departmentId"], where: { ...openWhere, dueDate: { lt: day.start } }, _count: { _all: true } }),
      prisma.task.groupBy({
        by: ["departmentId"],
        where: { ...openWhere, OR: [{ status: "BLOCKED" }, { blocked: true }] },
        _count: { _all: true },
      }),
      workingStaffToday(day),
    ]);
    const weekOff = day.dow === 0;
    const active = weekOff ? new Set<string>() : await startedToday(staff.map((s) => s.id), day);
    const count = (g: { departmentId: string | null; _count: { _all: number } }[]) => new Map(g.map((x) => [x.departmentId, x._count._all]));
    const openBy = count(open), overBy = count(overdue), blockBy = count(blocked);

    const rows: DeptRow[] = depts.map((d) => {
      const members = staff.filter((s) => s.departmentId === d.id);
      const enc = encodeURIComponent(d.name);
      return {
        id: d.id,
        name: d.name,
        slug: d.slug,
        people: members.length,
        open: openBy.get(d.id) ?? 0,
        overdue: overBy.get(d.id) ?? 0,
        blocked: blockBy.get(d.id) ?? 0,
        idle: weekOff ? null : members.filter((m) => !active.has(m.id)).length,
        href: `/tasks?dept=${enc}`,
        overdueHref: `/tasks?dept=${enc}&dueBefore=${yKey}`,
      };
    });
    const sum = (k: "open" | "overdue" | "blocked") => rows.reduce((n, r) => n + r[k], 0);
    return ok({
      rows,
      weekOff,
      totals: { open: sum("open"), overdue: sum("overdue"), blocked: sum("blocked"), idle: weekOff ? null : rows.reduce((n, r) => n + (r.idle ?? 0), 0) },
    });
  });
}

/* ------------------------------------------------- Idle people today */

export interface IdlePerson { id: string; name: string; department: string | null; openTasks: number }
export interface IdlePeople { weekOff: boolean; total: number; working: number; list: IdlePerson[] }

export function idlePeople(userId: string, _scope: Scope): Promise<Result<IdlePeople>> {
  return guarded("leadership.idle", async () => {
    if (!(await audience(userId))) return denied(NO_LEAD);
    const day = istToday();
    const staff = await workingStaffToday(day);
    if (day.dow === 0) return ok({ weekOff: true, total: 0, working: staff.length, list: [] });
    const active = await startedToday(staff.map((s) => s.id), day);
    const idle = staff.filter((s) => !active.has(s.id));
    const top = idle.slice(0, 12);
    const open = await prisma.task.groupBy({
      by: ["assigneeId"],
      where: { ...TASK_OPEN_WHERE, assigneeId: { in: top.map((t) => t.id) } },
      _count: { _all: true },
    });
    const openBy = new Map(open.map((o) => [o.assigneeId, o._count._all]));
    return ok({
      weekOff: false,
      total: idle.length,
      working: staff.length,
      list: top
        .map((p) => ({ id: p.id, name: p.name, department: p.department?.name ?? null, openTasks: openBy.get(p.id) ?? 0 }))
        // People who have open work but have not started are the ones worth a nudge.
        .sort((a, b) => b.openTasks - a.openTasks),
    });
  });
}

/* ------------------------------------------------- Clients at risk */

export interface RiskClient { id: string; name: string; overdue: number; open: number; health: string; worstDays: number }
export interface ClientsAtRisk { rows: RiskClient[]; totalOverdueClients: number }

export function clientsAtRisk(userId: string, _scope: Scope): Promise<Result<ClientsAtRisk>> {
  return guarded("leadership.clients", async () => {
    if (!(await audience(userId))) return denied(NO_LEAD);
    const day = istToday();
    const base = { ...TASK_OPEN_WHERE, clientId: { not: null } };
    const grouped = await prisma.task.groupBy({
      by: ["clientId"],
      where: { ...base, dueDate: { lt: day.start } },
      _count: { _all: true },
      _min: { dueDate: true },
      orderBy: { _count: { clientId: "desc" } },
    });
    const top = grouped.slice(0, 6);
    const ids = top.map((g) => g.clientId).filter((x): x is string => !!x);
    const [clients, open] = await Promise.all([
      prisma.client.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, health: true } }),
      prisma.task.groupBy({ by: ["clientId"], where: { ...base, clientId: { in: ids } }, _count: { _all: true } }),
    ]);
    const cBy = new Map(clients.map((c) => [c.id, c]));
    const oBy = new Map(open.map((o) => [o.clientId, o._count._all]));
    const rows: RiskClient[] = [];
    for (const g of top) {
      const c = g.clientId ? cBy.get(g.clientId) : undefined;
      if (!c) continue;
      rows.push({
        id: c.id,
        name: c.name,
        overdue: g._count._all,
        open: oBy.get(c.id) ?? g._count._all,
        health: c.health,
        worstDays: g._min.dueDate ? Math.max(1, Math.ceil((day.start.getTime() - g._min.dueDate.getTime()) / 86400000)) : 0,
      });
    }
    return ok({ rows, totalOverdueClients: grouped.length });
  });
}
