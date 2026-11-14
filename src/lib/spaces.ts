/**
 * TaskBoard 3 navigation: ONE flat row per destination (Lane G, "minimal and simple").
 *
 *   Home | Inbox | Tasks | <My department> | Clients | Sales | Team | Insights
 *
 * Max 8 rows, no nested rows. Pages that used to be separate rows are now tabs
 * on a shared strip (TAB_GROUPS, rendered by components/nav/SectionTabs.tsx).
 *
 * Visibility rule: a row shows iff at least one of its pages is in `pages`, the
 * exact list guardPage() checks (Employee.pageAccess, SUPER_ADMIN = all). The
 * sidebar can therefore never be looser than the page guards; the only extra
 * rules (Insights, Department) can only NARROW, never unlock.
 *
 * Department isolation (COO rule): the department row links to the viewer's OWN
 * department only. SUPER_ADMIN and members of the Leadership department
 * (Employee.department.slug === "leadership") get "Departments" -> the roll-up,
 * which is also the only audience for Insights.
 */
import { ROUTES, type ModuleMeta, type ModuleSlug } from "@/lib/nav";

export type SpaceId =
  | "home" | "inbox" | "tasks" | "dept" | "clients" | "sales" | "team" | "insights";

/** Who is looking: everything the row rules need besides the page grants. */
export interface NavUser {
  role?: string;
  /** Employee.department.slug (null = no department). */
  deptSlug?: string | null;
  deptName?: string | null;
}

export interface SpaceDef {
  id: SpaceId;
  label: string;
  /** Every page that may belong to this row, in click order. */
  pages: readonly ModuleSlug[];
  /** Page the row opens; falls back to the first granted page. */
  primary: ModuleSlug;
  /** Fixed path overriding the primary page's route (Inbox). */
  href?: string;
  /** Extra path prefixes that highlight the row. */
  alsoActive?: readonly string[];
}

/** Inbox (Lane B) is the merged Daily Updates + notifications page. */
export const INBOX_PATH = "/inbox";

export const SPACES: readonly SpaceDef[] = [
  { id: "home", label: "Home", primary: "Home", pages: ["Home", "Today", "Workspace", "Overview"] },
  { id: "inbox", label: "Inbox", primary: "Updates", pages: ["Updates"], href: INBOX_PATH, alsoActive: ["/updates"] },
  { id: "tasks", label: "Tasks", primary: "Tasks", pages: ["Tasks", "My Work", "Projects", "Calendar", "Time"] },
  // Department row is resolved from the viewer, not from page grants.
  { id: "dept", label: "Department", primary: "Today", pages: [], alsoActive: ["/dept"] },
  { id: "clients", label: "Clients", primary: "Clients", pages: ["Clients", "Finance"] },
  { id: "sales", label: "Sales", primary: "CRM", pages: ["CRM"] },
  { id: "team", label: "Team", primary: "Directory", pages: ["Directory", "HRMS", "LMS"], alsoActive: ["/team"] },
  { id: "insights", label: "Insights", primary: "Control", pages: ["Control", "Monitoring"] },
];

/** Admin destinations live in the gear menu, never in the sidebar. */
export const ADMIN_PAGES: readonly ModuleSlug[] = ["Settings", "Access", "Automations", "AI", "Lock"];

/** Pages every employee holds through workspace.access; a department row needs one. */
const WORKSPACE_PAGES: readonly ModuleSlug[] = ["Home", "Today", "Workspace", "Overview", "My Work", "Projects"];

const LEADERSHIP_SLUG = "leadership";

/** SUPER_ADMIN, or a member of the Leadership department. Nobody else sees another
 *  department's information: DEPARTMENT_HEAD / TEAM_LEAD of other departments do not. */
export function isLeadershipUser(user: NavUser | undefined): boolean {
  return user?.role === "SUPER_ADMIN" || user?.deptSlug === LEADERSHIP_SLUG;
}

export type SpaceMembership = SpaceId | "admin";

const SPACE_MAP = ((): Map<ModuleSlug, SpaceMembership> => {
  const map = new Map<ModuleSlug, SpaceMembership>();
  for (const s of SPACES) for (const p of s.pages) map.set(p, s.id);
  for (const p of ADMIN_PAGES) map.set(p, "admin");
  return map;
})();

export function spaceOf(slug: ModuleSlug): SpaceMembership | undefined {
  return SPACE_MAP.get(slug);
}

export function routeOf(slug: ModuleSlug): ModuleMeta | undefined {
  return ROUTES.find((r) => r.slug === slug);
}

export interface VisibleSpace extends SpaceDef {
  /** Granted pages of this row, in order (empty only for the dept row). */
  items: ModuleSlug[];
  primary: ModuleSlug;
  /** Where clicking the row goes. */
  path: string;
  /** Path prefixes that highlight the row. */
  matchPaths: string[];
}

function finish(def: SpaceDef, items: ModuleSlug[], primary: ModuleSlug): VisibleSpace {
  const path = def.href ?? routeOf(primary)?.path ?? "/";
  const matchPaths = [
    ...items.map((s) => routeOf(s)?.path).filter((p): p is string => !!p),
    ...(def.alsoActive ?? []),
    ...(def.href ? [def.href] : []),
  ];
  return { ...def, items, primary, path, matchPaths };
}

/** This row for the given page grants, or null when none are granted. */
export function resolveSpace(def: SpaceDef, pages: readonly ModuleSlug[]): VisibleSpace | null {
  const granted = new Set(pages);
  const items = def.pages.filter((p) => granted.has(p));
  if (items.length === 0) return null;
  return finish(def, items, items.includes(def.primary) ? def.primary : items[0]);
}

function resolveDept(def: SpaceDef, pages: readonly ModuleSlug[], user: NavUser | undefined): VisibleSpace | null {
  if (!WORKSPACE_PAGES.some((p) => pages.includes(p))) return null;
  const leader = isLeadershipUser(user);
  const slug = leader ? LEADERSHIP_SLUG : user?.deptSlug ?? null;
  if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const v = finish(def, [], def.primary);
  return {
    ...v,
    label: leader ? "Departments" : user?.deptName?.trim() || "Department",
    path: `/dept/${slug}`,
    matchPaths: ["/dept"],
  };
}

/** Sidebar rows for a viewer, in order. Insights is leadership-only (narrows a grant). */
export function visibleSpaces(pages: readonly ModuleSlug[], user?: NavUser | string): VisibleSpace[] {
  const u: NavUser | undefined = typeof user === "string" ? { role: user } : user;
  const out: VisibleSpace[] = [];
  for (const def of SPACES) {
    if (def.id === "dept") {
      const d = resolveDept(def, pages, u);
      if (d) out.push(d);
      continue;
    }
    if (def.id === "insights" && !isLeadershipUser(u)) continue;
    const s = resolveSpace(def, pages);
    if (s) out.push(s);
  }
  // One row per destination: a Sales-department user would otherwise see "Sales" twice
  // (own-department row + the CRM row). Keep the page row, drop the duplicate dept row.
  const dIdx = out.findIndex((r) => r.id === "dept");
  if (dIdx >= 0 && !isLeadershipUser(u)) {
    const label = out[dIdx].label.trim().toLowerCase();
    if (out.some((r, i) => i !== dIdx && r.label.trim().toLowerCase() === label)) out.splice(dIdx, 1);
  }
  return out;
}

/** Gear-menu entries for these page grants; empty means no gear at all. */
export function visibleAdminPages(pages: readonly ModuleSlug[]): ModuleSlug[] {
  const granted = new Set(pages);
  return ADMIN_PAGES.filter((p) => granted.has(p));
}

/** Mobile bottom bar: Home, Inbox, Tasks, (+), Department. */
export function bottomBarSpaces(pages: readonly ModuleSlug[], user?: NavUser | string): VisibleSpace[] {
  const keep = new Set<SpaceId>(["home", "inbox", "tasks", "dept"]);
  return visibleSpaces(pages, user).filter((s) => keep.has(s.id));
}

/* ───────────── Section tab strips (one strip per merged group) ───────────── */

export interface TabItem {
  label: string;
  href: string;
  /** Page grant that must be held for the tab to show. */
  slug: ModuleSlug;
}

export const TAB_GROUPS: Record<string, readonly TabItem[]> = {
  inbox: [
    { label: "Inbox", href: INBOX_PATH, slug: "Today" },
    { label: "Daily updates", href: "/updates", slug: "Updates" },
  ],
  home: [
    { label: "Today", href: "/today", slug: "Today" },
    { label: "Workspace", href: "/workspace", slug: "Workspace" },
    { label: "Overview", href: "/overview", slug: "Overview" },
  ],
  tasks: [
    { label: "My work", href: "/my-work", slug: "My Work" },
    { label: "Team tasks", href: "/tasks", slug: "Tasks" },
    { label: "Projects", href: "/projects", slug: "Projects" },
    { label: "Calendar", href: "/calendar", slug: "Calendar" },
    { label: "Time", href: "/time", slug: "Time" },
  ],
  clients: [
    { label: "Clients", href: "/clients", slug: "Clients" },
    { label: "Finance", href: "/finance", slug: "Finance" },
  ],
  team: [
    { label: "Directory", href: "/directory", slug: "Directory" },
    { label: "HR", href: "/hrms", slug: "HRMS" },
    { label: "Training", href: "/lms", slug: "LMS" },
  ],
  insights: [
    { label: "Control", href: "/control", slug: "Control" },
    { label: "Monitoring", href: "/monitoring", slug: "Monitoring" },
  ],
};
