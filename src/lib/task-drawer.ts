/**
 * task-drawer.ts — lightweight event-based global task drawer controller.
 *
 * Any component anywhere can call openTask(code) / createTask() / closeDrawer()
 * without importing a React context or prop-drilling. The GlobalTaskDrawer
 * mounted in the app layout listens for the custom DOM event and reacts.
 */

export type DrawerState = {
  open: boolean;
  taskId?: string;
  mode?: "view" | "create";
  defaultDate?: string;
  defaultAssigneeId?: string;
  defaultAssigneeIds?: string[];
  initialClientId?: string;
  initialProjectId?: string;
};

const EVENT = "taskboard:open-drawer";

/** Open the drawer in detail-view mode and push ?task=<code> to the URL. */
export function openTask(taskId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("task", taskId);
  window.history.pushState({}, "", url.toString());
  window.dispatchEvent(
    new CustomEvent<DrawerState>(EVENT, {
      detail: { open: true, taskId, mode: "view" },
    })
  );
}

/** Open the drawer in create-task mode (no URL change). */
export function createTask(defaults?: {
  dueDate?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  clientId?: string;
  projectId?: string;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DrawerState>(EVENT, {
      detail: {
        open: true,
        mode: "create",
        defaultDate: defaults?.dueDate,
        defaultAssigneeId: defaults?.assigneeId,
        defaultAssigneeIds: defaults?.assigneeIds ?? (defaults?.assigneeId ? [defaults.assigneeId] : undefined),
        initialClientId: defaults?.clientId,
        initialProjectId: defaults?.projectId,
      },
    })
  );
}

/** Close the drawer and strip ?task= from the URL. */
export function closeDrawer(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("task");
  window.history.replaceState({}, "", url.toString());
  window.dispatchEvent(
    new CustomEvent<DrawerState>(EVENT, { detail: { open: false } })
  );
}

/** Subscribe to drawer state changes (useful for components that want to react). */
export function onDrawerChange(
  cb: (state: DrawerState) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<DrawerState>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}