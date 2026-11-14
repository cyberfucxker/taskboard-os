"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import type { TaskView } from "@/components/tasks/types";
import type { DrawerState } from "@/lib/task-drawer";

const DRAWER_EVENT = "taskboard:open-drawer";

/**
 * Global task drawer — mounted once in the app layout.
 *
 * Opens in two ways:
 *   1. URL param ?task=<code> (3-char, old TSK-NNN links still resolve) (deep links, notifications, cross-page nav)
 *   2. Custom DOM event "taskboard:open-drawer" fired by openTask() / createTask()
 *      from anywhere in the app without prop-drilling.
 *
 * Defers to the Tasks board on /tasks (which has its own local drawer).
 * On every other page this component takes over.
 */
export function GlobalTaskDrawer({
  currentUserId,
  canAssign,
  currentUserName,
}: {
  currentUserId: string;
  canAssign: boolean;
  currentUserName?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // --- view mode state ---
  const [task, setTask] = useState<TaskView | null>(null);
  const [loading, setLoading] = useState(false);

  // --- create mode state ---
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    defaultDate?: string;
    defaultAssigneeIds?: string[];
    initialClientId?: string;
    initialProjectId?: string;
  }>({});
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; category?: string | null; clientId?: string | null }[]>([]);
  const catalogLoaded = useRef(false);

  const taskRef = searchParams.get("task");

  // The Tasks board manages its own local drawer — skip global drawer there.
  const onTasksPage = pathname === "/tasks";

  // Whether the view-mode drawer is active.
  const viewActive = Boolean(taskRef && !onTasksPage);

  // ----- Load catalog (employees, departments, clients, projects) lazily -----
  const ensureCatalog = useCallback(async () => {
    if (catalogLoaded.current) return;
    catalogLoaded.current = true;
    try {
      const res = await fetch("/api/tasks/catalog");
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.employees)) setEmployees(data.employees);
        if (Array.isArray(data.departments)) setDepartments(data.departments);
        if (Array.isArray(data.clients)) setClients(data.clients);
        if (Array.isArray(data.projects)) setProjects(data.projects);
      }
    } catch {
      // non-fatal — create modal still works with empty lists
    }
  }, []);

  // ----- Fetch task for view mode -----
  const loadTask = useCallback(async (code: string) => {
    setLoading(true);
    try {
      ensureCatalog();
      const res = await fetch(`/api/tasks/${encodeURIComponent(code)}`);
      const data = await res.json();
      setTask(data.ok ? data.task : null);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [ensureCatalog]);

  // ----- React to URL param (deep links) -----
  // Realtime: re-read the open task when anything changes (status, assignee, subtasks...).
  useOnLiveChange(() => {
    if (viewActive && taskRef) loadTask(taskRef);
  });

  useEffect(() => {
    if (viewActive) loadTask(taskRef!);
    else setTask(null);
  }, [taskRef, viewActive, pathname, loadTask]);

  // ----- React to taskboard:open-drawer events -----
  useEffect(() => {
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<DrawerState>).detail;
      if (!detail.open) {
        // Close both modes
        setTask(null);
        setCreateOpen(false);
        return;
      }
      if (detail.mode === "create") {
        setCreateDefaults({
          defaultDate: detail.defaultDate,
          defaultAssigneeIds: detail.defaultAssigneeIds ?? (detail.defaultAssigneeId ? [detail.defaultAssigneeId] : undefined),
          initialClientId: detail.initialClientId,
          initialProjectId: detail.initialProjectId,
        });
        ensureCatalog();
        setCreateOpen(true);
        return;
      }
      // view mode — taskId already pushed to URL by openTask(), so URL effect handles it.
      // But when we're on /tasks the local drawer owns it; still no-op here.
    }
    window.addEventListener(DRAWER_EVENT, onEvent);
    return () => window.removeEventListener(DRAWER_EVENT, onEvent);
  }, [ensureCatalog]);

  // ----- Close helpers -----
  function closeView() {
    setTask(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    url.searchParams.delete("assignee");
    window.history.replaceState({}, "", url.pathname + (url.search !== "?" ? url.search : ""));
  }

  function closeCreate() {
    setCreateOpen(false);
  }

  // ----- Refetch helper for status/subtask mutations -----
  async function refetchAnd(action: () => Promise<Response>) {
    await action();
    if (viewActive && taskRef) loadTask(taskRef);
  }

  return (
    <>
      {/* Loading overlay */}
      {viewActive && loading && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/50">
          <div className="h-full w-full max-w-5xl border-l border-edge bg-raised p-6 text-[13px] text-muted">
            Loading…
          </div>
        </div>
      )}

      {/* Task detail drawer */}
      <TaskDrawer
        task={task}
        open={viewActive && Boolean(task)}
        onClose={closeView}
        onStatus={(id, status, reason) =>
          refetchAnd(() =>
            fetch(`/api/tasks/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "status", status, reason }),
            })
          )
        }
        onSubtask={(taskId, subtaskId, done) =>
          refetchAnd(() =>
            fetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "subtask", subtaskId, done }),
            })
          )
        }
        employees={employees}
        currentUserId={currentUserId}
        canAssign={canAssign}
      />

      {/* Create task modal */}
      {createOpen && (
        <NewTaskModal
          open={createOpen}
          onClose={closeCreate}
          employees={employees}
          departments={departments}
          clients={clients}
          projects={projects}
          currentUserId={currentUserId}
          currentUserName={currentUserName ?? ""}
          canAssign={canAssign}
          defaultAssigneeIds={createDefaults.defaultAssigneeIds}
          defaultDate={createDefaults.defaultDate}
          initialClientId={createDefaults.initialClientId}
          initialProjectId={createDefaults.initialProjectId}
          onCreated={() => {
            closeCreate();
            router.refresh();
          }}
        />
      )}
    </>
  );
}