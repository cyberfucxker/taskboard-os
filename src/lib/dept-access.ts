import type { Prisma } from "@prisma/client";

/**
 * Department dashboard access rules (COO rule, 2026-10). PURE - no DB, no session reads -
 * so the rules can be unit-tested (tests/dept-access.test.ts).
 *
 * RULE: a user may open /dept/<slug> ONLY for their own department. Other departments'
 * dashboards are visible ONLY to SUPER_ADMIN and members of the Leadership department.
 * DEPARTMENT_HEAD / TEAM_LEAD / HR of another department get no cross-department access.
 * Role never widens a QUERY: every query below is scoped by the viewed department's id.
 */

export interface Viewer {
  id: string;
  role: string;
  departmentId: string | null;
  departmentSlug: string | null;
}

export type Scope = "mine" | "all";

/** Who may see every department. */
export function canViewAnyDept(v: Viewer): boolean {
  return v.role === "SUPER_ADMIN" || v.departmentSlug === "leadership";
}

/** May this viewer open the dashboard of department `slug`? */
export function canViewDept(v: Viewer, slug: string): boolean {
  return (v.departmentSlug !== null && v.departmentSlug === slug) || canViewAnyDept(v);
}

/** Lead widgets (Meta/CRM) need crm.view AND the viewer's OWN department - not a roll-up view. */
export function canSeeDeptLeads(v: Viewer, departmentId: string, hasCrmView: boolean): boolean {
  return hasCrmView && v.departmentId !== null && v.departmentId === departmentId;
}

/** The viewed department's OWN tasks. In "mine" scope only ones the viewer is on. */
export function ownDeptWhere(
  departmentId: string, scope: Scope, userId: string, extra?: Prisma.TaskWhereInput,
): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [{ deletedAt: null, archivedAt: null, departmentId }];
  if (scope === "mine") {
    and.push({ OR: [{ assigneeId: userId }, { assignees: { some: { employeeId: userId } } }] });
  }
  if (extra) and.push(extra);
  return { AND: and };
}

/**
 * "Across departments": open tasks that belong to ANOTHER department (or none) but involve
 * a member of the viewed department - assignee, co-assignee, or creator (a task assigned from
 * this department to another one has a creator in it). Scope "mine": only tasks the viewer
 * is personally on, whichever department owns them. Callers must select only
 * code, title, status, dueDate and the other department's name.
 */
export function acrossDeptWhere(departmentId: string, scope: Scope, userId: string): Prisma.TaskWhereInput {
  const involvesMe: Prisma.TaskWhereInput = {
    OR: [{ assigneeId: userId }, { assignees: { some: { employeeId: userId } } }, { creatorId: userId }],
  };
  const involvesDept: Prisma.TaskWhereInput = {
    OR: [
      { assignee: { departmentId } },
      { assignees: { some: { employee: { departmentId } } } },
      { creator: { departmentId } },
    ],
  };
  return {
    AND: [
      { deletedAt: null, archivedAt: null, status: { not: "DONE" } },
      { OR: [{ departmentId: null }, { departmentId: { not: departmentId } }] },
      scope === "mine" ? involvesMe : involvesDept,
    ],
  };
}
