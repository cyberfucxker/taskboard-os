import type { EntityType, PeekTarget, TaskFilters } from "@/types";

/**
 * URL helpers for entity deep-linking.
 *
 * Navigation (going to an entity) is separated from filtering (narrowing the
 * current list):
 *   - entityUrl   → the canonical detail destination for an entity
 *   - peekUrl     → current page + ?peek=type:id (lightweight drawer overlay)
 *   - filterUrl   → current page + merged filter params (?clientId=, …)
 *   - parseFilters / parsePeek → typed readers for the above.
 */

const ENTITY_BASE_PATHS: Record<EntityType, string> = {
  task: "/tasks",
  client: "/clients",
  project: "/projects",
  person: "/team",
  department: "/tasks",
};

/** Canonical detail URL for an entity. Tasks/depts are drawer- or filter-routed. */
export function entityUrl(type: EntityType, id: string): string {
  if (type === "task") return `/tasks?task=${id}`;
  if (type === "department") return `/tasks?dept=${encodeURIComponent(id)}`;
  return `${ENTITY_BASE_PATHS[type]}/${id}`;
}

/** currentPath + ?peek=type:id — open a detail drawer on top of the current page. */
export function peekUrl(type: EntityType, id: string, currentPath: string): string {
  const sep = currentPath.includes("?") ? "&" : "?";
  return `${currentPath}${sep}peek=${type}:${id}`;
}

/** `TaskFilters` plus the deeper filters TasksBoard added on top — kept here
 *  rather than in `@/types` so the shared type stays untouched; a future pass
 *  can fold these back in if other consumers need them. */
export interface TaskFiltersExtended extends TaskFilters {
  /** Multiple assignees, OR'd — comma-joined in the URL (`?assigneeIds=a,b`). */
  assigneeIds?: string[];
  /** Due-date range, inclusive, ISO `YYYY-MM-DD` strings. */
  dueAfter?: string;
  dueBefore?: string;
}

/** Build a filtered URL (current path) by merging/removing filter params. */
export function filterUrl(currentPath: string, filters: Partial<TaskFiltersExtended>): string {
  const url = new URL(currentPath, "http://local.invalid");
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const qs = url.searchParams.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
}

/** Parse task-list filters from URL search params. */
export function parseFilters(params: URLSearchParams): TaskFiltersExtended {
  const assigneeIdsRaw = params.get("assigneeIds");
  return {
    dept: params.get("dept") ?? undefined,
    assigneeId: params.get("assigneeId") ?? undefined,
    assigneeIds: assigneeIdsRaw ? assigneeIdsRaw.split(",").filter(Boolean) : undefined,
    clientId: params.get("clientId") ?? undefined,
    projectId: params.get("projectId") ?? undefined,
    status: params.get("status") ?? undefined,
    priority: params.get("priority") ?? undefined,
    search: params.get("search") ?? undefined,
    dueAfter: params.get("dueAfter") ?? undefined,
    dueBefore: params.get("dueBefore") ?? undefined,
  };
}

/** Parse `?peek=client:cl_abc` → { type, id } | null. */
export function parsePeek(params: URLSearchParams): PeekTarget | null {
  const peek = params.get("peek");
  if (!peek) return null;
  const idx = peek.indexOf(":");
  if (idx <= 0 || idx === peek.length - 1) return null;
  const type = peek.slice(0, idx) as EntityType;
  const id = peek.slice(idx + 1);
  if (!["task", "client", "project", "person", "department"].includes(type)) return null;
  return { type, id };
}