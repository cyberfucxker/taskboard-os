import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { effectiveCaps, type AccessOverrides, type Capability } from "@/lib/rbac";
import type { Employee, Prisma } from "@prisma/client";

/**
 * Attribute-level access (CORE-01) — the "I'm in control of what each
 * employee sees" surface. Two responsibilities:
 *
 *   1. effectiveCapsForSession — computes the employee's REAL capability set
 *      (base role ⊕ department add-ons ⊕ per-employee overrides). This is what
 *      every guard and API mutation checks, so nothing is hardcoded to role.
 *   2. scopedTaskWhere — restricts the task query a non-leadership/non-admin
 *      employee sees: their own department + tasks assigned directly to them.
 *      Commercial surfaces (revenue/deals/finance) are already withheld at the
 *      capability layer, so a backlink/DM/SEO exec never touches them.
 *
 * The employee's stored accessOverrides are loaded fresh per decision rather
 * than cached in the JWT, so a SUPER_ADMIN's change on the Access page takes
 * effect on the employee's next request (no re-login needed — overrides are
 * read live here; only a role change needs a re-login).
 */
export type ScopedSession = Session & {
  user: {
    id: string;
    role: NonNullable<Session["user"]>["role"];
    departmentId: string | null;
    departmentSlug: string | null;
  };
};

const rowToOverrides = (row: Pick<Employee, "accessOverrides"> | null): AccessOverrides | null =>
  (row?.accessOverrides as AccessOverrides | null) ?? null;

/** Shallow-derived scope from the session claims when no DB read is needed. */
export function deptCaps(session: ScopedSession, overrides: AccessOverrides | null): Set<Capability> {
  return effectiveCaps(
    session.user.role,
    session.user.departmentSlug ?? null,
    overrides
  );
}

/** Recompute effective capabilities straight from the employee's row. */
export async function effectiveCapsForSession(session: ScopedSession): Promise<Set<Capability>> {
  if (!session.user?.id) return new Set<Capability>();
  const overrides = await getOverrides(session.user.id);
  return deptCaps(session, overrides);
}

/** Cheap live read of one employee's override chips. */
export async function getOverrides(employeeId: string): Promise<AccessOverrides | null> {
  const row = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { accessOverrides: true },
  });
  return rowToOverrides(row);
}

/**
 * Task visibility rule (CORE-05/01) — role decides breadth, then department and
 * participation narrow it:
 *
 *   SUPER_ADMIN / HR / DEPARTMENT_HEAD / TEAM_LEAD / Leadership
 *     -> the whole board (no filter).
 *   Everyone else
 *     -> tasks in their own department, OR any task they are attached to.
 *
 * "Attached to" covers every way an employee can end up on a task regardless of
 * which department owns it: primary assignee, co-assignee, creator, commenter,
 * report author, time logger, work-session assignee, and a subtask assignee.
 * So a DM executive working a dev task still sees it, without that granting any
 * right to browse the rest of the dev board.
 *
 * Commercial surfaces (revenue/deals/finance) are withheld separately at the
 * capability layer in rbac.ts, so a scoped employee still never reaches them.
 */
export async function scopedTaskWhere(
  session: ScopedSession
): Promise<Prisma.TaskWhereInput> {
  const role = session.user.role;
  const isLeadership = session.user.departmentSlug === "leadership";

  // Roles that run a team or the whole org see everything.
  if (
    role === "SUPER_ADMIN" ||
    role === "HR" ||
    role === "DEPARTMENT_HEAD" ||
    role === "TEAM_LEAD" ||
    isLeadership
  ) {
    return {}; // unrestricted: SUPER_ADMIN, HR, account management, dept heads/leads, leadership dept
  }

  const me = session.user.id;
  const OR: Prisma.TaskWhereInput["OR"] = [];

  // 1. Their own department's board.
  if (session.user.departmentId) {
    OR.push({ departmentId: session.user.departmentId });
  }

  // 2. Every task they are personally attached to, in any department.
  OR.push({ assigneeId: me });
  OR.push({ assignees: { some: { employeeId: me } } });
  OR.push({ creatorId: me });
  OR.push({ comments: { some: { authorId: me } } });
  OR.push({ reports: { some: { authorId: me } } });
  OR.push({ timeLogs: { some: { employeeId: me } } });
  OR.push({ workSessions: { some: { assigneeId: me } } });
  OR.push({ subtasks: { some: { assigneeId: me } } });

  return { OR };
}

/**
 * Client visibility rule (entity-linking). Non-leadership/non-admin employees
 * see only clients that have at least one task in their visible scope (their
 * department, or assigned to / created by them). Leadership sees everything.
 */
export async function scopedClientWhere(
  session: ScopedSession
): Promise<Prisma.ClientWhereInput> {
  const role = session.user.role;
  if (role === "SUPER_ADMIN" || role === "HR") {
    return {}; // unrestricted
  }
  const taskWhere = await scopedTaskWhere(session);
  return { tasks: { some: taskWhere } };
}

/** Project visibility rule — mirrors scopedClientWhere.
 * COO 2026-10-06: account management (Peyton) and the leadership department see
 * every project, past and present. Safe to widen: project responses carry no
 * financial fields, and the tasks inside a project stay scoped (see getProjectById). */
export async function scopedProjectWhere(
  session: ScopedSession
): Promise<Prisma.ProjectWhereInput> {
  const role = session.user.role;
  if (
    role === "SUPER_ADMIN" ||
    role === "HR" ||
    role === "ACCOUNT_MANAGER" ||
    role === "DEPARTMENT_HEAD" ||
    role === "TEAM_LEAD" ||
    session.user.departmentSlug === "leadership"
  ) {
    return {};
  }
  const taskWhere = await scopedTaskWhere(session);
  return { tasks: { some: taskWhere } };
}