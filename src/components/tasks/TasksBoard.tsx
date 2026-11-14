"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Plus, Ban } from "lucide-react";
import { Badge, Avatar, SectionLabel, Card } from "@/components/ui";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { StatusPicker, StatusIcon, type Status } from "@/components/tasks/pickers";
import { EntityMention } from "@/components/entity/EntityMention";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { TasksList } from "@/components/tasks/TasksList";
import { SavedViews } from "@/components/tasks/SavedViews";
import { Kbd } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { StageTransitionModal } from "@/components/tasks/StageTransitionModal";
import { cn } from "@/lib/cn";
import type { TaskView } from "@/components/tasks/types";
import { ListToolbar, useListFilter, useWideScreen } from "@/components/list";

const STATUS_ORDER = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
const STATUS_COLORS: Record<string, string> = {
  TODO: "var(--muted)", IN_PROGRESS: "var(--teal)", IN_REVIEW: "var(--amber)", BLOCKED: "var(--crimson)", DONE: "var(--emerald)",
};
const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do", IN_PROGRESS: "In Progress", IN_REVIEW: "In Review", BLOCKED: "Blocked", DONE: "Done",
};
// Phase B — higher priority cards sort above lower ones within a column.
const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function taskSearchText(t: TaskView): string {
  return [t.title, t.code, t.creatorName, t.clientName, t.department, ...t.assignees.map((a) => a.name)].filter(Boolean).join(" ");
}

interface Ctx {
  tasks: TaskView[];
  employees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  canAssign: boolean;
  clients?: { id: string; name: string }[];
  projects?: { id: string; name: string; category?: string | null; clientId?: string | null }[];
  archivedTasks?: TaskView[];
  /** Where this viewer lands by default — their own department's queue,
   *  unless they hold board.view (leadership sees "all" by default). A
   *  `?dept=` in the URL always wins, same as the existing assignee/task
   *  deep-link params below. */
  defaultDept?: string;
}

export function TasksBoard({ tasks, employees, departments, currentUserId, currentUserName, canAssign, defaultDept, clients, projects, archivedTasks }: Ctx) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();
  // Quick text filter (debounced, mirrored to ?q=) over the loaded tasks.
  const qf = useListFilter(tasks, taskSearchText);
  const q = qf.applied;
  const setQ = qf.setQuery;
  // >= 1536px: the open task docks as a persistent peek pane instead of an overlay.
  const wide = useWideScreen();
  const [assignee, setAssignee] = useState("all");
  const [dept, setDept] = useState(defaultDept ?? "all");
  const [prio, setPrio] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Board | List toggle — defaults to date-sorted "list" view.
  const [view, setView] = useState<"board" | "list">(() =>
    typeof window !== "undefined" && localStorage.getItem("taskboard.taskView") === "board" ? "board" : "list"
  );
  useEffect(() => {
    try { localStorage.setItem("taskboard.taskView", view); } catch { /* ignore */ }
  }, [view]);
  const [tab, setTab] = useState<"active" | "archived">("active");
  // Apply a saved view → the same setters the inline filters use.
  function applyView(v: { dept?: string; assigneeId?: string; priority?: string; q?: string }) {
    setDept(v.dept && v.dept !== "mine" ? v.dept : defaultDept ?? "all");
    setAssignee(v.assigneeId ? (v.assigneeId === currentUserId ? "me" : v.assigneeId) : "all");
    setPrio(v.priority ?? "all");
    setQ(v.q ?? "");
  }
  // Keyboard shortcuts: B/L toggle board↔list, N new task, ? overview.
  const [showKeys, setShowKeys] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      switch (e.key.toLowerCase()) {
        case "b": setView("board"); break;
        case "l": setView("list"); break;
        case "n": setCreateOpen(true); break;
        case "?": setShowKeys((s) => !s); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stageModal, setStageModal] = useState<{
    task: TaskView;
    targetStatus: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  } | null>(null);
  // COO req — moving a task to BLOCKED requires a blocker description. This
  // small controlled inline prompt is shown before the status PATCH goes out.
  const [blockPromptId, setBlockPromptId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockErr, setBlockErr] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);
  // Depth filters: multi-assignee (on top of the quick single-assignee select
  // above) and a due-date range, tucked behind the "more filters" toggle.
  const [showMore, setShowMore] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => {
    const raw = searchParams.get("assigneeIds");
    return raw ? raw.split(",").filter(Boolean) : [];
  });
  const [dueAfter, setDueAfter] = useState(searchParams.get("dueAfter") ?? "");
  const [dueBefore, setDueBefore] = useState(searchParams.get("dueBefore") ?? "");

  // Deep-linking: auto-open task from ?task=<code> and/or pre-filter by ?assignee=<id|me>
  useEffect(() => {
    const taskCode = searchParams.get("task");
    if (taskCode) {
      const match = tasks.find((t) => t.code === taskCode.trim().toUpperCase() || t.id === taskCode);
      if (match) setOpenId(match.id);
      else {
        // Old TSK-123 links: the API resolves legacy aliases, so ask it for the real id.
        fetch(`/api/tasks/${encodeURIComponent(taskCode)}`)
          .then((r) => r.json())
          .then((d) => { if (d?.ok && d.task?.id) setOpenId(d.task.id); })
          .catch(() => {});
      }
    }
    const assigneeParam = searchParams.get("assignee");
    if (assigneeParam) {
      setAssignee(assigneeParam === "me" ? "me" : assigneeParam);
    }
    const deptParam = searchParams.get("dept");
    if (deptParam) setDept(deptParam);
  }, [searchParams, tasks]);

  const filtered = useMemo(() => {
    return qf.filtered.filter((t) => {
      // "Assigned to me" checks the full assignees list, not just primary
      if (assignee === "me") {
        if (!t.assignees.some((a) => a.id === currentUserId)) return false;
      } else if (assignee !== "all") {
        if (!t.assignees.some((a) => a.id === assignee)) return false;
      }
      // Depth filter: narrow further to a specific set of assignees (OR'd),
      // on top of whatever the quick single-assignee select above already did.
      if (assigneeIds.length > 0 && !t.assignees.some((a) => assigneeIds.includes(a.id))) return false;
      // Strict department filter (COO 2026-10-07): a department chip shows only that
      // department tasks. Cross-department tasks you touch stay visible under All depts
      // and compose with the assignee filter.
      if (dept !== "all" && t.department !== dept) return false;
      if (prio !== "all" && t.priority !== prio) return false;
      if (dueAfter || dueBefore) {
        const due = t.dueDate ? t.dueDate.slice(0, 10) : null;
        if (!due) return false;
        if (dueAfter && due < dueAfter) return false;
        if (dueBefore && due > dueBefore) return false;
      }
      return true;
    });
  }, [qf.filtered, assignee, assigneeIds, dept, prio, dueAfter, dueBefore, currentUserId]);

  const deptCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tasks) if (t.department) c[t.department] = (c[t.department] ?? 0) + 1;
    return c;
  }, [tasks]);

  /** Keep the URL in sync with the depth filters so a view is shareable/
   *  bookmarkable — same lightweight replaceState technique already used
   *  above for the task/assignee deep-link params, not a router.push nav. */
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    set("dept", dept !== "all" ? dept : "");
    set("assigneeIds", assigneeIds.join(","));
    set("dueAfter", dueAfter);
    set("dueBefore", dueBefore);
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, assigneeIds, dueAfter, dueBefore]);

  const openTask = tasks.find((t) => t.id === openId) ?? null;
  // Deep links (or API-resolved ids) outside the loaded list yield null —
  // surface that instead of failing silently with ?task= stuck in the URL.
  const openMissing = openId !== null && openTask === null;
  function closeTaskDrawer() {
    setOpenId(null);
    // Clear the ?task= param on close, keep the other query params.
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  async function changeStatus(id: string, status: string, reason?: string) {
    // COO req — a task may only move to BLOCKED with a non-blank blocker
    // description. When none is supplied (drag/drop or the drawer's Block
    // button), open the inline prompt instead of issuing the PATCH.
    if (status === "BLOCKED" && !(reason ?? "").trim()) {
      setBlockPromptId(id);
      setBlockReason("");
      setBlockErr(false);
      return;
    }
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status, reason }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(status === "DONE" ? "Marked done ✓" : `→ ${STATUS_LABELS[status]}`, "success");
      startTransition(() => router.refresh());
    } else toast(data.error ?? "Update failed", "error");
  }

  const cancelBlockPrompt = () => {
    setBlockPromptId(null);
    setBlockReason("");
    setBlockErr(false);
  };

  async function confirmBlockPrompt() {
    const id = blockPromptId;
    if (!id) return;
    if (!blockReason.trim()) {
      setBlockErr(true);
      return; // blank → don't PATCH, keep the card, show the hint
    }
    setBlockSaving(true);
    await changeStatus(id, "BLOCKED", blockReason.trim());
    setBlockSaving(false);
    cancelBlockPrompt();
  }

  /** Drop a dragged card onto a status column → persisting status change. */
  async function setArchive(id: string, archived: boolean) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", archived }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(archived ? "Task archived" : "Task restored", "success");
      startTransition(() => router.refresh());
    } else toast(data.error ?? "Failed", "error");
  }

  function onDropCard(status: string) {
    const id = dragId;
    setDragId(null);
    setDropCol(null);
    if (!id) return;
    const t = filtered.find((x) => x.id === id);
    if (!t || t.status === status || saving) return;
    // Intercept drag-and-drop on all stage drops to display the outcome modal before persisting status changes
    setStageModal({ task: t, targetStatus: status as any });
  }

  async function toggleSubtask(taskId: string, subtaskId: string, done: boolean) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subtask", subtaskId, done }),
    });
    if (res.ok) {
      startTransition(() => router.refresh());
    } else toast("Subtask update failed", "error");
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, BLOCKED: 0, DONE: 0 };
    for (const t of filtered) c[t.status]++;
    return c;
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-hover px-5 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[16px] font-semibold text-ink flex items-center gap-2">
              Tasks
              <span className="bg-amber/10 text-amber border-amber/20 text-xs rounded px-2 py-0.5">{filtered.filter((t: any) => t.status !== "DONE").length} uncompleted</span>
            </h1>
            <p className="label mt-0.5">{filtered.length} in view · capture with <span className="font-mono text-tealhi">⌘K</span></p>
          </div>
        </div>

        {/* New + Filters */}
        <div className="flex items-center gap-2">
          <SavedViews
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            active={{ dept, assigneeId: assignee === "me" ? "me" : assignee === "all" ? undefined : assignee, priority: prio, q }}
            onApply={applyView}
          />
          <div className="flex overflow-hidden rounded-md border border-hover">
            <button onClick={() => setTab("active")} className={cn("px-2.5 py-1.5 text-[12px] transition", tab === "active" ? "bg-teal/15 text-tealhi" : "bg-raised text-muted hover:text-ink")}>Active</button>
            <button onClick={() => setTab("archived")} className={cn("px-2.5 py-1.5 text-[12px] transition", tab === "archived" ? "bg-teal/15 text-tealhi" : "bg-raised text-muted hover:text-ink")}>Archived{archivedTasks && archivedTasks.length > 0 ? ` (${archivedTasks.length})` : ""}</button>
          </div>
                    <div className="flex overflow-hidden rounded-md border border-hover">
            <button onClick={() => setView("board")} className={cn("px-2.5 py-1.5 text-[12px] transition", view === "board" ? "bg-teal/15 text-tealhi" : "bg-raised text-muted hover:text-ink")}>Board</button>
            <button onClick={() => setView("list")} className={cn("px-2.5 py-1.5 text-[12px] transition", view === "list" ? "bg-teal/15 text-tealhi" : "bg-raised text-muted hover:text-ink")}>List</button>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-tealhi"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New task</span>
          </button>
          <Select value={assignee} onChange={setAssignee} label="Assignee">
            <option value="all">Everyone</option>
            <option value="me">Assigned to me</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Select value={dept} onChange={setDept} label="Dept" className="hidden md:block">
            <option value="all">All depts</option>
            {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </Select>
          <Select value={prio} onChange={setPrio} label="Priority" className="hidden md:block">
            <option value="all">All prio</option>
            <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option>
          </Select>
          <button
            onClick={() => setShowMore((s) => !s)}
            className={cn(
              "rounded-md border p-2",
              showMore || assigneeIds.length > 0 || dueAfter || dueBefore
                ? "border-teal bg-teal/10 text-tealhi"
                : "border-hover bg-raised text-muted"
            )}
            title="More filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ListToolbar filter={qf} shown={filtered.length} total={tasks.length} noun="tasks" placeholder="Filter tasks…" />

      {/* Department quick-filter chips — replaces the old per-department pages */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hover px-5 py-2">
        <Chip active={dept === "all"} onClick={() => setDept("all")}>
          All depts <span className="text-muted">{tasks.length}</span>
        </Chip>
        {departments.map((d) => (
          <Chip key={d.id} active={dept === d.name} onClick={() => setDept(d.name)}>
            {d.name} <span className="text-muted">{deptCounts[d.name] ?? 0}</span>
          </Chip>
        ))}
      </div>

      {showMore && (
        <div className="flex flex-wrap items-start gap-5 border-b border-hover bg-bg px-5 py-3">
          <div>
            <div className="label mb-1.5">Due date</div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dueAfter}
                onChange={(e) => setDueAfter(e.target.value)}
                className="rounded-md border border-hover bg-raised px-2 py-1 text-[12px] text-ink focus:border-teal focus:outline-none"
              />
              <span className="text-[11px] text-muted">to</span>
              <input
                type="date"
                value={dueBefore}
                onChange={(e) => setDueBefore(e.target.value)}
                className="rounded-md border border-hover bg-raised px-2 py-1 text-[12px] text-ink focus:border-teal focus:outline-none"
              />
              {(dueAfter || dueBefore) && (
                <button onClick={() => { setDueAfter(""); setDueBefore(""); }} className="text-[11px] text-muted underline">
                  clear
                </button>
              )}
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="label mb-1.5">
              Assignees {assigneeIds.length > 0 && <span className="text-tealhi">({assigneeIds.length})</span>}
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {employees.map((e) => {
                const on = assigneeIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() =>
                      setAssigneeIds((prev) => (on ? prev.filter((id) => id !== e.id) : [...prev, e.id]))
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      on ? "border-teal bg-teal/15 text-tealhi" : "border-hover text-muted"
                    )}
                  >
                    {e.name}
                  </button>
                );
              })}
              {assigneeIds.length > 0 && (
                <button onClick={() => setAssigneeIds([])} className="text-[11px] text-muted underline">
                  clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Board / list (left) + persistent peek pane for the open task (right, >= 1536px) */}
      <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {tab === "archived" ? (
        <ArchivedView tasks={archivedTasks ?? []} onUnarchive={(id) => setArchive(id, false)} />
      ) : view === "board" ? (
      <div className="scroll-x flex min-h-0 flex-1 gap-3 overflow-y-hidden p-4">
        {STATUS_ORDER.map((st) => (
          <div
            key={st}
            className="flex max-h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden"
            onDragOver={(e) => { e.preventDefault(); if (dropCol !== st) setDropCol(st); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol((c) => (c === st ? null : c)); }}
            onDrop={(e) => { e.preventDefault(); onDropCard(st); }}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[st] }} />
              <span className="text-[13px] font-medium text-ink">{STATUS_LABELS[st]}</span>
              <span className="font-mono text-[11px] text-muted">{counts[st]}</span>
            </div>
            <div
              className={cn(
                "min-h-[40px] min-w-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg p-0.5 transition",
                dropCol === st && "bg-teal/10 outline outline-2 outline-dashed outline-teal/40"
              )}
            >
              {filtered.filter((t) => t.status === st).sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority]).map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  dragging={dragId === t.id}
                  onOpen={() => {
                    setOpenId(t.id);
                    // Set URL for deep-linking
                    const url = new URL(window.location.href);
                    url.searchParams.set("task", t.code);
                    window.history.replaceState({}, "", url.toString());
                  }}
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
                  onDragEnd={() => { setDragId(null); setDropCol(null); }}
                  onStatus={changeStatus}
                />
              ))}
              {counts[st] === 0 && (
                <div className="rounded-lg border border-dashed border-hover px-3 py-6 text-center text-xs text-edge">
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      ) : (
        <TasksList
          tasks={filtered}
          employees={employees}
          canAssign={canAssign}
          onBulkChanged={() => startTransition(() => router.refresh())}
          onClearFilter={qf.active ? qf.clear : undefined}
          onActiveChange={(id) => {
            // Peek follows J/K once a task is open.
            if (!wide || !openId) return;
            setOpenId(id);
            const url = new URL(window.location.href);
            url.searchParams.set("task", filtered.find((t) => t.id === id)?.code ?? "");
            window.history.replaceState({}, "", url.toString());
          }}
          onOpenTask={(id) => {
            setOpenId(id);
            const url = new URL(window.location.href);
            url.searchParams.set("task", filtered.find((t) => t.id === id)?.code ?? "");
            window.history.replaceState({}, "", url.toString());
          }}
        />
      )}
      </div>
      {wide && openTask && tab !== "archived" && (
        <aside data-peek-pane="" className="flex min-h-0 w-[560px] shrink-0 flex-col overflow-hidden border-l border-edge bg-raised">
          <TaskDrawer
            inline
            task={openTask}
            open
            onClose={closeTaskDrawer}
            onStatus={changeStatus}
            onSubtask={toggleSubtask}
            employees={employees}
            currentUserId={currentUserId}
            canAssign={canAssign}
          />
        </aside>
      )}
      </div>

      {openMissing && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-edge bg-raised px-4 py-2.5 text-[13px] text-ink shadow-2xl">
          <span>Task not found or not visible to you.</span>
          <button
            type="button"
            onClick={closeTaskDrawer}
            className="rounded-md bg-teal px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-tealhi"
          >
            Dismiss
          </button>
        </div>
      )}

      <NewTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        employees={employees}
        departments={departments}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        canAssign={canAssign}
        clients={clients}
        projects={projects}
        onCreated={() => startTransition(() => router.refresh())}
      />

      <TaskDrawer
        task={openTask}
        open={Boolean(openTask) && !(wide && tab !== "archived")}
        onClose={closeTaskDrawer}
        onStatus={changeStatus}
        onSubtask={toggleSubtask}
        employees={employees}
        currentUserId={currentUserId}
        canAssign={canAssign}
      />

      {stageModal && (
        <StageTransitionModal
          open={Boolean(stageModal)}
          task={stageModal.task}
          targetStatus={stageModal.targetStatus}
          onClose={() => setStageModal(null)}
          onSuccess={() => startTransition(() => router.refresh())}
          currentUserId={currentUserId}
          canAssign={canAssign}
        />
      )}

      {/* COO req — a blocker description is required to move a task to Blocked.
          Small controlled inline prompt, shown before the status PATCH goes out. */}
      {blockPromptId && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4" onMouseDown={cancelBlockPrompt}>
          <div
            className="w-full max-w-sm rounded-lg border border-hover bg-raised p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[14px] font-semibold text-crimson">
              <Ban className="h-4 w-4" /> Block task
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Moving this task to Blocked requires a blocker description.
            </p>
            <textarea
              autoFocus
              rows={3}
              value={blockReason}
              onChange={(e) => { setBlockReason(e.target.value); if (e.target.value.trim()) setBlockErr(false); }}
              placeholder="What's blocking this task?"
              className="mt-3 w-full resize-none rounded-md border border-hover bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
            />
            {blockErr && (
              <p className="mt-1 text-[11px] text-crimson">A blocker description is required.</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={cancelBlockPrompt}
                className="rounded-md border border-hover px-3 py-1.5 text-[12px] text-muted hover:bg-bg"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlockPrompt}
                disabled={blockSaving}
                className="flex items-center gap-1.5 rounded-md bg-crimson px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-85 disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" /> {blockSaving ? "Blocking…" : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Keyboard shortcut cheat-sheet */}
      {showKeys && (
        <div className="fixed left-1/2 top-20 z-50 w-64 -translate-x-1/2 rounded-lg border border-hover bg-raised p-4 shadow-2xl">
          <div className="label mb-3">Shortcuts</div>
          <ul className="space-y-2 text-[12px] text-ink">
            <li><Kbd>B</Kbd> / <Kbd>L</Kbd> <span className="ml-1 text-muted">Board / List</span></li>
            <li><Kbd>N</Kbd> <span className="ml-1 text-muted">New task</span></li>
            <li><Kbd>?</Kbd> <span className="ml-1 text-muted">This help</span></li>
          </ul>
        </div>
      )}
    </div>
  );
}

function ArchivedView({ tasks, onUnarchive }: { tasks: TaskView[]; onUnarchive: (id: string) => void }) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="rounded-lg border border-dashed border-hover px-6 py-8 text-center text-[13px] text-muted">
          No archived tasks. Archived tasks land here and can be restored.
        </div>
      </div>
    );
  }
  return (
    <div className="scroll-x flex-1 overflow-y-auto p-4">
      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-hover bg-raised px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-muted">{t.code}</span>
                <span className="truncate text-[13px] text-ink">{t.title}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                <Badge text={t.status} />
                {t.department && <span>{t.department}</span>}
              </div>
            </div>
            <button
              onClick={() => onUnarchive(t.id)}
              className="shrink-0 rounded-md bg-teal px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-tealhi"
            >
              Unarchive
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskCard({ task, onOpen, onDragStart, onDragEnd, dragging, onStatus }: {
  task: TaskView; onOpen: () => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  onStatus?: (id: string, status: string, reason?: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.dueDate && task.dueDate.slice(0, 10) < today && task.status !== "DONE";
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab select-none px-3 py-2.5 transition active:cursor-grabbing hover:border-edge",
        dragging && "rotate-1 opacity-40",
        task.status === "BLOCKED" && "border-crimson/30",
        overdue && task.status !== "BLOCKED" && "border-amber/40"
      )}
    >
      <div onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span onClick={(e) => e.stopPropagation()}>
              {onStatus ? (
                <StatusPicker value={task.status as Status} onChange={(s, reason) => onStatus(task.id, s, reason)}>
                  <button type="button" title={`Status: ${STATUS_LABELS[task.status]}`} className="flex items-center rounded p-0.5 hover:bg-hover focus:outline-none focus-visible:ring-1">
                    <StatusIcon status={task.status} size={13} />
                  </button>
                </StatusPicker>
              ) : (
                <StatusIcon status={task.status} size={13} />
              )}
            </span>
            <span className="font-mono text-[10px] text-muted">{task.code}</span>
            {task.creatorName && (
              <span className="rounded bg-hover px-1.5 py-0.5 text-[9px] font-medium text-muted" title={`Created by ${task.creatorName}`}>
                by {task.creatorName.split(" ")[0]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {overdue && <span className="rounded bg-crimson/10 px-1 py-0.5 font-mono text-[9px] font-bold uppercase text-crimson">overdue</span>}
            <Badge text={task.priority} />
          </div>
        </div>
        <div className="mt-1 text-[13px] font-medium leading-snug text-ink">{task.title}</div>

        {task.outcome && <p className="mt-1 line-clamp-1 text-[12px] text-muted">{task.outcome}</p>}

        <div className="mt-2.5 flex items-center gap-2">
          {/* Entity deep-links (#12): each connected entity is shown and links to it */}
          {task.clientId && task.clientName && (
            <span className="label" onClick={(e) => e.stopPropagation()}>
              <EntityMention entity={{ type: "client", id: task.clientId, name: task.clientName }} />
            </span>
          )}
          {task.projectId && task.projectName && (
            <span className="label" onClick={(e) => e.stopPropagation()}>
              <EntityMention entity={{ type: "project", id: task.projectId, name: task.projectName }} />
            </span>
          )}
          {task.department && (
            <span className="label" style={{ color: task.departmentColor ?? "var(--muted)" }} onClick={(e) => e.stopPropagation()}>
              <EntityMention entity={{ type: "department", id: task.department, name: task.department }} />
            </span>
          )}
          {task.status === "TODO" && task.dueDate && task.elapsedMs === null && (
            <span className="font-mono text-[10px] text-muted">est {task.estimateHrs ?? "–"}h</span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {task.dueLabel && (
              <span
                className="font-mono text-[11px]"
                style={{ color: task.dueLabel === "Today" ? "var(--crimson)" : task.dueLabel === "Tomorrow" ? "var(--amber)" : "var(--muted)" }}
              >
                {task.dueLabel}
              </span>
            )}
            {/* Multiple assignee avatars (stacked, max 3 + count) */}
            {task.assignees.length > 0 && (
              <span className="flex items-center -space-x-1.5">
                {task.assignees.slice(0, 3).map((a) => (
                  <Link
                    key={a.id}
                    href={`/tasks?assignee=${a.id}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`Tasks assigned to ${a.name}`}
                  >
                    <span className="block rounded-full ring-2 ring-[var(--bg)]"><Avatar name={a.name} size={20} muted={task.status === "DONE"} /></span>
                  </Link>
                ))}
                {task.assignees.length > 3 && (
                  <span className="ml-1 font-mono text-[10px] text-muted">+{task.assignees.length - 3}</span>
                )}
              </span>
            )}
          </span>
        </div>

        {task.subtasks.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1">
              <div className="h-1 overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full bg-tealhi"
                  style={{ width: `${Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100)}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-[10px] text-muted">
              {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition",
        active ? "border-teal bg-teal/15 text-ink" : "border-hover text-muted hover:border-edge"
      )}
    >
      {children}
    </button>
  );
}

function Select({ value, onChange, label, children, className }: {
  value: string; onChange: (v: string) => void; label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        "rounded-md border border-hover bg-raised px-2 py-1.5 text-[12px] text-ink focus:border-teal focus:outline-none",
        className
      )}
    >
      {children}
    </select>
  );
}