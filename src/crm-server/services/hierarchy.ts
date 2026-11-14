import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Whose CRM records a person may see — the legacy CRM's reporting-tree model mapped onto TaskBoard.
 *
 * The legacy CRM walked a `reportingLeaderId` tree. TaskBoard has no such tree; it has roles and
 * departments. The mapping keeps the legacy CRM's three tiers:
 *   - full access (every lead, including unassigned ones): SUPER_ADMIN and DEPARTMENT_HEAD,
 *   - a manager's subtree: TEAM_LEAD sees themselves plus everyone in their own department,
 *   - everyone else: only leads assigned to them.
 * As in the legacy CRM, an unassigned lead is visible only at full access, so incoming leads are
 * distributed by whoever owns the funnel rather than shown to every team lead at once.
 */
export interface DataScope {
  isAll: boolean;
  /** The employees whose records this person may see — always includes themselves. */
  userIds: string[];
  role: Role;
}

export const FULL_ACCESS_ROLES: Role[] = ["SUPER_ADMIN", "DEPARTMENT_HEAD"];
const MANAGES_OTHERS: Role[] = ["TEAM_LEAD"];

/**
 * Who the CRM is for — COO decision 2026-09-29: only the Sales and Leadership departments.
 * Everyone in those departments sees every lead (one shared funnel); nobody else reaches the CRM
 * at all, whatever role or capability chips they hold (a dev TEAM_LEAD has crm.view from their
 * role, and must still be kept out). Revenue figures in CRM reports are Leadership-only.
 * SUPER_ADMIN always counts as Leadership.
 */
export const CRM_DEPARTMENTS = ["sales", "leadership"];

export interface CrmAudience {
  allowed: boolean;
  /** Leadership department or SUPER_ADMIN — sees revenue in reports. */
  isLeadership: boolean;
}

export async function crmAudience(employeeId: string): Promise<CrmAudience> {
  const me = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { role: true, department: { select: { slug: true } } },
  });
  const slug = me?.department?.slug ?? null;
  const isLeadership = me?.role === "SUPER_ADMIN" || slug === "leadership";
  return { allowed: isLeadership || (slug !== null && CRM_DEPARTMENTS.includes(slug)), isLeadership };
}

export async function resolveDataScope(employeeId: string): Promise<DataScope> {
  const me = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { role: true, departmentId: true },
  });
  const role: Role = me?.role ?? "EXECUTIVE";
  if (FULL_ACCESS_ROLES.includes(role)) return { isAll: true, userIds: [], role };
  // Sales + Leadership share one funnel: everyone the CRM admits sees every lead.
  if ((await crmAudience(employeeId)).allowed) return { isAll: true, userIds: [], role };
  if (!MANAGES_OTHERS.includes(role) || !me?.departmentId) {
    return { isAll: false, userIds: [employeeId], role };
  }

  const team = await prisma.employee.findMany({
    where: { departmentId: me.departmentId, deletedAt: null },
    select: { id: true },
  });
  const others = team.map((t) => t.id).filter((id) => id !== employeeId);
  return { isAll: false, userIds: [employeeId, ...others], role };
}

/** The `where` fragment for anything owned through `assignedUserId`. Unassigned leads excluded. */
export function ownerScope(scope: DataScope | undefined): { assignedUserId?: { in: string[] } } {
  if (!scope || scope.isAll) return {};
  return { assignedUserId: { in: scope.userIds } };
}

/** May this person hand a record to that person? Yourself and your own scope, nobody else. */
export function canAssignTo(scope: DataScope | undefined, targetUserId: string): boolean {
  if (!scope || scope.isAll) return true;
  return scope.userIds.includes(targetUserId);
}

/** Who this person may hand work to; null means anyone. */
export function assignableIds(scope: DataScope | undefined): string[] | null {
  if (!scope || scope.isAll) return null;
  return scope.userIds;
}
