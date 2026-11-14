import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import type { Capability } from "@/lib/rbac";
import { MODULES, ROUTES, type ModuleSlug } from "@/lib/nav";

/**
 * Page-based per-employee access (CORE-01, workstream A).
 *
 * Access control is now driven by WHICH PAGES an employee is granted
 * (`Employee.pageAccess` — the COO's per-employee list from the Access page),
 * not by role-derived capability gates. This file is the single source of
 * truth for that model:
 *
 *   - `ALL_PAGES`   — every module slug that appears in the sidebar / guards.
 *   - `effectivePages` — the pages the current session may open
 *     (SUPER_ADMIN bypasses and gets all; everyone else reads their stored list).
 *   - `guardPage`   — the one-line page guard. Authenticates, then requires the
 *     page be granted AND that the page's data capabilities are still held
 *     (commercial guardrail — see `pageImplies`), so granting a page never
 *     leaks commercial data it shouldn't.
 */
export type PageSlug = ModuleSlug;

/** Every module currently in the shell. */
export const ALL_PAGES: PageSlug[] = [
  "Home", "Today", "Calendar", "Automations", "Tasks", "My Work", "CRM", "Directory", "Projects", "Clients",
  "HRMS", "Finance", "AI", "Access",
  "Monitoring", "LMS", "Control", "Settings", "Lock", "Time", "Overview", "Workspace", "Updates",
];

export const DEFAULT_EMPLOYEE_PAGES: PageSlug[] = [
  "Home", "Today", "Tasks", "My Work", "Directory",
  "Projects", "Calendar", "Settings", "Time",
];

/**
 * The commercial safety which pages reach. A page grant never overrides a
 * capability guard: opening `Finance` still requires `finance.view` (revenue,
 * money); `Deals` still requires `crm.salesDeals` (weighted forecast); `CRM`
 * still requires `crm.view`. A junior manually handed the Finance page but
 * lacking finance.view is therefore still kept out of P&L. This mirrors what
 * COMMERCIAL in rbac.ts protects.
 */
export const PAGE_IMPLIES: Record<PageSlug, readonly Capability[]> = {
  Home: ["workspace.access"], // R8 bento — SUPER_ADMIN-only until COO sign-off (nobody else is granted it)
  Today: ["workspace.access"], // universal — everyone needs their own day
  Calendar: ["workspace.access"], // universal — timeline and schedules
  Time: ["workspace.access"], // your own time — no sidecar
  Lock: ["workspace.access"], // universal — any employee can veil their own panels
  Control: ["hrms.view"], // leadership-only surface (page itself re-checks LEADER_ROLES for SUPER_ADMIN/DEPARTMENT_HEAD/HR)
  Settings: ["workspace.access"], // settings & integrations
  Tasks: ["tasks.view"],
  // "Standup": ["workspace.access"],
  "My Work": ["workspace.access"], // universal — everyone sees their own tasks
  CRM: ["crm.view"],
  Directory: ["directory.view"],
  Projects: ["workspace.access"],
  Clients: ["crm.salesDeals"], // client accounts — COMMERCIAL
  HRMS: ["hrms.view"],
  Finance: ["finance.view"], // invoices, revenue, money — COMMERCIAL
  AI: ["workspace.access"],
  Access: ["admin.scope"],
  Monitoring: ["tasks.manage"],
  Overview: ["workspace.access"],
  Workspace: ["workspace.access"],
  Updates: ["workspace.access"], // leadership monitoring surface
  LMS: ["lms.view"],
  Automations: ["workspace.access"],
};

/** The data capabilities a page exposes — used by the Access admin surface. */
export function pageImplies(page: PageSlug): readonly Capability[] {
  return PAGE_IMPLIES[page] ?? [];
}

/**
 * Pages the session may open. SUPER_ADMIN bypasses the stored list entirely and
 * sees all pages — consistent with the COO being able to always get in.
 * Everyone else reads their stored `pageAccess` (live, no caching).
 */
export async function effectivePages(session: ScopedSession): Promise<Set<PageSlug>> {
  if (session.user.role === "SUPER_ADMIN") return new Set<PageSlug>(ALL_PAGES);
  if (!session.user.id) return new Set<PageSlug>();
  const row = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { pageAccess: true },
  });
  const rawPages = (row?.pageAccess ?? []) as PageSlug[];
  const pages = rawPages.length === 0 ? DEFAULT_EMPLOYEE_PAGES : rawPages;
  return new Set<PageSlug>(["Home", ...pages]);
}

/** Path of the first module the session can actually open (their home page), or
 *  null when nothing is granted. Used as the safe redirect target so a guard
 *  never bounces the user onto a page that isn't theirs (redirect loop). */
export function firstGrantedPath(pages: Set<PageSlug>): string | null {
  for (const slug of MODULES) {
    if (pages.has(slug)) {
      return ROUTES.find((r) => r.slug === slug)?.path ?? null;
    }
  }
  return null;
}

/**
 * Page guard for server components. Redirects to /login when unauthenticated,
 * /overview when the page isn't granted or a data capability it implies isn't
 * held. Reads live from the DB, so a COO grant on the Access page applies to
 * the employee's next request.
 *
 * Returns the scoped session so the caller can reuse it for data scoping.
 */
export async function guardPage(page: PageSlug): Promise<ScopedSession> {
  const session = (await getServerSession(authOptions)) as ScopedSession | null;
  if (!session?.user?.id) redirect("/login");

  const pages = await effectivePages(session);
  // Safe home target — never the page being guarded (would re-trigger this
  // guard and loop). Falls back to /login when the employee has no pages yet.
  const home = firstGrantedPath(pages) ?? "/login";

  if (!pages.has(page)) redirect(home);

  // Commercial guardrail — a page guard never unlocks its data without the cap.
  const held = await effectiveCapsForSession(session);
  for (const cap of PAGE_IMPLIES[page] ?? []) {
    if (!held.has(cap)) redirect(home);
  }

  return session;
}