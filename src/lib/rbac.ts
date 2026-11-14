import type { Role } from "@prisma/client";

/**
 * RBAC — role + attribute based access control (CORE-01).
 *
 * Access is computed from THREE things, not role alone:
 *
 *   1. BASE role capability set   → the floor every holder of the role gets.
 *   2. DEPARTMENT add-ons         → commercial/functional extras the role
 *      WOULD NOT otherwise have, granted because of the department they work
 *      in (e.g. a Sales executive sees the CRM; a DM executive of the same
 *      tier does NOT see revenue/deals). This is what keeps a backlink
 *      employee out of company P&L.
 *   3. Per-employee OVERRIDES     → explicit `allow`/`deny` chips a SUPER_ADMIN / HR
 *      layers on top for full control (admin.scope). Never hardcoded.
 *
 * Tenant isolation for client seats (CLIENT_ADMIN/CLIENT_VIEWER) is enforced
 * separately by the data layer (`withTenant`) — not here.
 */

export type Capability =
  | "workspace.access"
  | "board.view" // executive overview — revenue, delivery, P&L (COMMERCIAL)
  | "directory.view"
  | "tasks.view"
  | "tasks.manage"
  | "tasks.assign" // assign a task to another employee (leadership; grantable per-person)
  | "crm.view"
  | "crm.manage"
  | "crm.salesDeals" // deals + weighted forecast (COMMERCIAL)
  | "sales.engine.manage" // autonomous AI sales engine — run proposals, follow-ups (COMMERCIAL)
  | "sales.proposal.approve" // leadership approval gate for AI proposals (COMMERCIAL)
  | "finance.view" // invoices, revenue, money (COMMERCIAL)
  | "finance.manage"
  | "hrms.view"
  | "hrms.manage"
  | "portal.access"
  | "admin.users"
  | "admin.roles"
  | "admin.scope" // control what each employee sees
  | "lms.view" // take training modules
  | "lms.manage"; // watch every employee's course progress + answers (leadership)

/** Commercial surfaces — intentionally absent from junior + non-commercial roles. */
export const COMMERCIAL: Capability[] = [
  "board.view",
  "finance.view",
  "finance.manage",
  "crm.salesDeals",
  "sales.engine.manage",
  "sales.proposal.approve",
];

const BASE: Record<Role, Capability[]> = {
  SUPER_ADMIN: [
    "workspace.access", "board.view", "directory.view",
    "tasks.view", "tasks.manage", "tasks.assign", "crm.view", "crm.manage", "crm.salesDeals",
    "finance.view", "finance.manage", "hrms.view", "hrms.manage",
    "sales.engine.manage", "sales.proposal.approve",
    "admin.users", "admin.roles", "admin.scope", "lms.view", "lms.manage",
  ],
  DEPARTMENT_HEAD: [
    "workspace.access", "board.view", "directory.view",
    "tasks.view", "tasks.manage", "tasks.assign", "crm.view", "crm.manage", "hrms.view", "lms.view",
  ],
  TEAM_LEAD: [
    "workspace.access", "directory.view",
    "tasks.view", "tasks.manage", "tasks.assign", "crm.view", "crm.manage", "lms.view",
  ],
  SENIOR_EXECUTIVE: [
    "workspace.access", "directory.view",
    "tasks.view", "tasks.manage", "tasks.assign", "lms.view",
  ],
  EXECUTIVE: ["workspace.access", "tasks.view", "tasks.manage", "lms.view"],
  INTERN: ["workspace.access", "tasks.view", "tasks.manage", "lms.view"],
  ACCOUNT_MANAGER: [
    "workspace.access", "directory.view",
    "board.view", "tasks.view", "tasks.manage", "crm.view", "crm.manage", "crm.salesDeals", "lms.view",
  ],
  HR: [
    "workspace.access", "directory.view", "hrms.view", "hrms.manage",
    "admin.scope", "admin.roles", "admin.users", "tasks.view", "tasks.manage", "lms.view", "lms.manage",
  ],
  FINANCE: ["workspace.access", "directory.view", "tasks.view", "finance.view", "finance.manage", "lms.view"],
  CLIENT_ADMIN: ["portal.access"],
  CLIENT_VIEWER: ["portal.access"],
  EXTERNAL_CONTRACTOR: ["workspace.access", "tasks.view", "tasks.manage"],
};

/**
 * Department add-ons — commercial/CRM surface per department. Keyed by the
 * department slug (we seed 7 depts: leadership, sales, design, dev, dm, hr,
 * finance). A Sales BDE (EXECUTIVE) therefore reaches the CRM while a DM
 * exec of the same tier does not.
 */
export const DEPT_ADDONS: Record<string, Capability[]> = {
  leadership: ["board.view", "finance.view", "crm.view", "crm.manage", "crm.salesDeals", "sales.engine.manage", "sales.proposal.approve", "lms.manage"],
  sales: ["crm.view", "crm.manage", "crm.salesDeals", "sales.engine.manage"],
  finance: ["finance.view", "finance.manage"],
  // design / dev / dm / hr → nothing extra; CRM is theirs via shared tasks only
};

export interface AccessOverrides {
  allow?: Capability[];
  deny?: Capability[];
}

/** The full role→base-cap matrix, exported for the Access admin surface. */
export const baseCapsByRole: Record<Role, readonly Capability[]> = BASE;

export function baseCaps(role: Role): readonly Capability[] {
  return BASE[role] ?? [];
}

/**
 * Display grouping for the Access admin surface — lets the COO and HR reason about a
 * capability ("Finance · invoices, revenue") instead of a raw flag name.
 */
export const ACCESS_GROUPS: { label: string; caps: Capability[] }[] = [
  {
    label: "Workspace",
    caps: ["workspace.access", "directory.view"],
  },
  {
    label: "Board · executive",
    caps: ["board.view"],
  },
  {
    label: "Tasks",
    caps: ["tasks.view", "tasks.manage", "tasks.assign"],
  },
  {
    label: "CRM",
    caps: ["crm.view", "crm.manage", "crm.salesDeals"],
  },
  {
    label: "Sales Engine (GaaS)",
    caps: ["sales.engine.manage", "sales.proposal.approve"],
  },
  {
    label: "Finance",
    caps: ["finance.view", "finance.manage"],
  },
  {
    label: "HR / People",
    caps: ["hrms.view", "hrms.manage"],
  },
  {
    label: "Portal",
    caps: ["portal.access"],
  },
  {
    label: "Admin",
    caps: ["admin.users", "admin.roles", "admin.scope"],
  },
  {
    label: "LMS",
    caps: ["lms.view", "lms.manage"],
  },
];

/** Effective capabilities: base ∪ dept add-ons ∪ override.allow − override.deny. */
export function effectiveCaps(
  role: Role,
  deptSlug: string | null,
  overrides: AccessOverrides | null
): Set<Capability> {
  const set = new Set<Capability>(BASE[role] ?? []);
  if (deptSlug && DEPT_ADDONS[deptSlug]) for (const c of DEPT_ADDONS[deptSlug]) set.add(c);
  if (overrides?.allow) for (const c of overrides.allow) set.add(c);
  if (overrides?.deny) for (const c of overrides.deny) set.delete(c);
  return set;
}

/** Pure check (no DB) — use when you only have the role. */
export function canRole(role: Role, capability: Capability): boolean {
  return BASE[role]?.includes(capability) ?? false;
}

/** True if a capability is withheld by role (never by override). */
export function isCommercial(cap: Capability): boolean {
  return COMMERCIAL.includes(cap);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "COO View",
  DEPARTMENT_HEAD: "Department Head",
  TEAM_LEAD: "Team Lead",
  SENIOR_EXECUTIVE: "Senior Executive",
  EXECUTIVE: "Executive",
  INTERN: "Intern",
  ACCOUNT_MANAGER: "Account Manager",
  HR: "HR",
  FINANCE: "Finance",
  CLIENT_ADMIN: "Client Admin",
  CLIENT_VIEWER: "Client Viewer",
  EXTERNAL_CONTRACTOR: "Contractor",
};

export const ROLE_ORDER: Role[] = [
  "SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "SENIOR_EXECUTIVE",
  "EXECUTIVE", "INTERN", "ACCOUNT_MANAGER", "HR", "FINANCE",
  "CLIENT_ADMIN", "CLIENT_VIEWER", "EXTERNAL_CONTRACTOR",
];

export const ALL_CAPABILITIES: Capability[] = [
  "workspace.access", "board.view", "directory.view",
  "tasks.view", "tasks.manage", "tasks.assign", "crm.view", "crm.manage", "crm.salesDeals",
  "sales.engine.manage", "sales.proposal.approve",
  "finance.view", "finance.manage", "hrms.view", "hrms.manage",
  "portal.access", "admin.users", "admin.roles", "admin.scope",
  "lms.view", "lms.manage",
];
