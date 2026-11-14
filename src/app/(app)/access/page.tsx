import { guardPage, type PageSlug } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { AccessManager, type AccessEmployeeRow } from "@/components/access/AccessManager";
import {
  baseCapsByRole, DEPT_ADDONS, ROLE_LABELS, ACCESS_GROUPS,
  type AccessOverrides,
} from "@/lib/rbac";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Access (CORE-01) — the SUPER_ADMIN "I'm in control" surface. Lists every
 * employee, their EFFECTIVE capability set (base role ⊕ department add-ons ⊕
 * per-employee overrides) as toggle chips, and lets the COO change a role or
 * flip any allow/deny chip on a named employee. Nothing is hardcoded — a chip
 * toggled here writes `accessOverrides` and is read live by the next guard.
 */
export default async function AccessPage() {
  await guardPage("Access");
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { department: { select: { slug: true, name: true } } },
  });

  // Compute the effective set for every employee server-side so the table
  // opens already reflecting current reality (before any chips are toggled).
  const rows: AccessEmployeeRow[] = employees.map((e) => {
    const deptSlug = e.department?.slug ?? null;
    const overrides = (e.accessOverrides ?? null) as AccessOverrides | null;
    return {
      id: e.id,
      name: e.name,
      email: e.email,
      title: e.title ?? null,
      role: e.role as Role,
      status: e.status as string,
      deptSlug,
      deptName: e.department?.name ?? null,
      pages: (e.pageAccess as PageSlug[]) ?? [],
      allow: overrides?.allow ?? [],
      deny: overrides?.deny ?? [],
    };
  });

  return (
    <AccessManager
      rows={rows}
      baseCapsByRole={baseCapsByRole}
      deptAddons={DEPT_ADDONS}
      roleLabels={ROLE_LABELS}
      groups={ACCESS_GROUPS}
    />
  );
}