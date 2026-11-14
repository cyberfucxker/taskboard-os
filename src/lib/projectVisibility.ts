/**
 * projectVisibility — pure rules for the Tasks command center (COO 2026-10-06).
 *
 * - Category -> department slugs uses FUZZY substring matching on purpose:
 *   project categories are free-form service strings ("Full-Stack Web App & SaaS
 *   Pipeline"), not an enum. Exact matching would silently hide projects the
 *   moment someone rewords a category.
 * - A project with an unmapped (or null) category is visible ONLY through direct
 *   assignment — never through the department rule. Failing closed beats leaking.
 * - Client names are redacted unless canSeeClient(role): ACCOUNT_MANAGER / SUPER_ADMIN.
 */

export type RoleLike = string;

/** Department slugs that own digital-marketing work. */
const DM_MARKERS = ["digital-marketing", "digital marketing", "marketing"];
/** Department slugs that own web/app/dev work. */
const DEV_MARKERS = ["development", "full-stack", "full stack", "web", "saas", "app", "dev"];

const DM_DEPTS = ["dm", "design", "sales"];
const DEV_DEPTS = ["dev", "design"];

/** Department slugs allowed to see a project of this category (union when both match). */
export function deptsForCategory(category: string | null | undefined): string[] {
  const c = (category ?? "").toLowerCase();
  if (!c) return [];
  const out = new Set<string>();
  if (DM_MARKERS.some((m) => c.includes(m))) for (const d of DM_DEPTS) out.add(d);
  if (DEV_MARKERS.some((m) => c.includes(m))) for (const d of DEV_DEPTS) out.add(d);
  return [...out];
}

/** Client names are shown only to account management and super admins. */
export function canSeeClient(role: RoleLike | null | undefined): boolean {
  return role === "ACCOUNT_MANAGER" || role === "SUPER_ADMIN";
}

export interface ProjectTasksLite {
  id: string;
  assigneeIds: string[];
}

/**
 * Project visibility for one viewer. Leadership (board.view holders — decided by
 * the caller) sees everything. Everyone else sees a project iff they are assigned
 * to at least one of its tasks OR their department slug is in the category map.
 */
export function projectVisibleTo(
  project: { tasks: ProjectTasksLite[]; category: string | null | undefined },
  viewer: { id: string; deptSlug: string | null | undefined; leadership: boolean },
): boolean {
  if (viewer.leadership) return true;
  if (project.tasks.some((t) => t.assigneeIds.includes(viewer.id))) return true;
  if (!viewer.deptSlug) return false;
  const allowed = deptsForCategory(project.category);
  if (allowed.length === 0) return false;
  return allowed.includes(viewer.deptSlug);
}

/** Kanban/status order used inside every project card. */
export const STATUS_ORDER = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
export type StatusBucket = (typeof STATUS_ORDER)[number];

const DAY_MS = 86_400_000;

/** IST calendar day (YYYY-MM-DD) for a timestamp — due dates are day-precision. */
function istDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export interface DueCountdown {
  text: string;
  overdue: boolean;
  today: boolean;
}

/** "Due in 2d" / "Due tomorrow" / "Due today" / "Overdue by 3d", in IST days. */
export function dueCountdown(
  dueDate: string | Date | null | undefined,
  nowMs: number = Date.now(),
): DueCountdown | null {
  if (!dueDate) return null;
  const dueMs = new Date(dueDate).getTime();
  if (Number.isNaN(dueMs)) return null;
  const diff = Math.round(
    (Date.parse(istDayKey(dueMs) + "T00:00:00Z") - Date.parse(istDayKey(nowMs) + "T00:00:00Z")) / DAY_MS,
  );
  if (diff > 1) return { text: `Due in ${diff}d`, overdue: false, today: false };
  if (diff === 1) return { text: "Due tomorrow", overdue: false, today: false };
  if (diff === 0) return { text: "Due today", overdue: false, today: true };
  return { text: `Overdue by ${Math.abs(diff)}d`, overdue: true, today: false };
}
