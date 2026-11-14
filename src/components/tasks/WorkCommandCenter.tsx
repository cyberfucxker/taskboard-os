"use client";

/**
 * WorkCommandCenter — "My Work Command Center" (COO 2026-10-06).
 * Card-based tasks view: KPI header, tasks grouped by project card with status
 * buckets, Department Queue for unlinked tasks. Replaces the flat kanban as the
 * /tasks view; TasksBoard.tsx stays in the tree as instant rollback.
 *
 * Visibility is enforced SERVER-side (page.tsx filters projects + strips client
 * names before they reach this component). What arrives here is all viewable.
 * Client names arrive already redacted (null) unless the viewer may see them.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Card, Badge, Stat, SectionLabel } from "@/components/ui";
import { StatusIcon, AssigneeAvatar } from "@/components/tasks/pickers/atoms";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { cn } from "@/lib/cn";
import {
  STATUS_ORDER,
  dueCountdown,
  type StatusBucket,
} from "@/lib/projectVisibility";
import type { TaskView } from "@/components/tasks/types";

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  BLOCKED: "Blocked",
  DONE: "Done",
};

export interface CommandProject {
  id: string;
  name: string;
  category: string | null;
  /** Already redacted (null) server-side unless the viewer may see clients. */
  clientName: string | null;
  tasks: TaskView[];
}

export interface CommandKpis {
  open: number;
  blocked: number;
  dueThisWeek: number;
  activeProjects: number;
}

interface Props {
  projects: CommandProject[];
  unlinked: TaskView[];
  kpis: CommandKpis;
  employees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  allProjects: { id: string; name: string; category?: string | null; clientId?: string | null }[];
  currentUserId: string;
  currentUserName: string;
  canAssign: boolean;
  defaultDept: string;
}

function taskDue(t: TaskView) {
  return dueCountdown(t.dueDate);
}

function isOverdue(t: TaskView): boolean {
  return taskDue(t)?.overdue ?? false;
}

function isDueToday(t: TaskView): boolean {
  const d = taskDue(t);
  return d !== null && (d.today || d.overdue);
}

export function WorkCommandCenter({
  projects,
  unlinked,
  kpis,
  employees,
  departments,
  clients,
  allProjects,
  currentUserId,
  currentUserName,
  canAssign,
  defaultDept,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [dept, setDept] = useState(defaultDept ?? "all");
  const [assignee, setAssignee] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createProjectId, setCreateProjectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [blockPromptId, setBlockPromptId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockErr, setBlockErr] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);

  // Department options come from the canonical department list (all non-deleted),
  // not from whatever tasks happen to be visible - otherwise departments with no
  // visible tasks vanish from the filter entirely.
  const deptOptions = useMemo(() => {
    return ["all", ...departments.map((d) => d.name).sort()];
  }, [departments]);

  function taskPasses(t: TaskView): boolean {
    if (assignee === "me") {
      if (!t.assignees.some((a) => a.id === currentUserId)) return false;
    } else if (assignee !== "all") {
      if (!t.assignees.some((a) => a.id === assignee)) return false;
    }
    // Strict department filter (COO 2026-10-07): a department pill shows only that
    // department tasks. No involvement bypass - cross-department tasks you touch stay
    // visible under All depts and compose with the Everyone/Mine assignee filter.
    if (dept !== "all" && t.department !== dept) return false;
    return true;
  }

  const visibleProjects = useMemo(
    () =>
      projects
        .map((p) => ({ ...p, tasks: p.tasks.filter(taskPasses) }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
        .filter((p) => p.tasks.length > 0),
    // taskPasses closes over dept/assignee; recompute on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, dept, assignee],
  );
  const visibleUnlinked = useMemo(() => unlinked.filter(taskPasses), [unlinked, dept, assignee]);

  // Open / close the drawer, keeping ?task= in sync (same pattern as TasksBoard).
  useEffect(() => {
    const code = searchParams.get("task");
    if (code) {
      const all = [...projects.flatMap((p) => p.tasks), ...unlinked];
      const match = all.find((t) => t.code === code.trim().toUpperCase() || t.id === code);
      if (match) setOpenId(match.id);
    }
    const deptParam = searchParams.get("dept");
    if (deptParam) setDept(deptParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const allTasks = useMemo(
    () => [...projects.flatMap((p) => p.tasks), ...unlinked],
    [projects, unlinked],
  );
  const openTask = allTasks.find((t) => t.id === openId) ?? null;
  const openMissing = openId !== null && openTask === null;
  function closeTaskDrawer() {
    setOpenId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    window.history.replaceState({}, "", url.pathname + url.search);
  }
  function openTaskById(id: string) {
    setOpenId(id);
    const url = new URL(window.location.href);
    const t = allTasks.find((x) => x.id === id);
    url.searchParams.set("task", t?.code ?? "");
    window.history.replaceState({}, "", url.toString());
  }

  async function changeStatus(id: string, status: string, reason?: string) {
    // COO rule carried over: BLOCKED needs a non-blank blocker description.
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
      toast(status === "DONE" ? "Marked done ✓" : `→ ${STATUS_LABELS[status] ?? status}`, "success");
      startTransition(() => router.refresh());
    } else toast(data.error ?? "Update failed", "error");
  }

  async function toggleSubtask(taskId: string, subtaskId: string, done: boolean) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subtask", subtaskId, done }),
    });
    if (res.ok) startTransition(() => router.refresh());
    else toast("Subtask update failed", "error");
  }

  function openCreate(projectId: string | null) {
    setCreateProjectId(projectId);
    setCreateOpen(true);
  }

  function bucketize(tasks: TaskView[]): Record<StatusBucket, TaskView[]> {
    const out = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], BLOCKED: [], DONE: [] } as Record<
      StatusBucket,
      TaskView[]
    >;
    for (const t of tasks) {
      const b = (STATUS_ORDER as readonly string[]).includes(t.status)
        ? (t.status as StatusBucket)
        : "TODO";
      out[b].push(t);
    }
    return out;
  }

  function renderTaskRow(t: TaskView) {
    const due = taskDue(t);
    const mine = t.assignees.some((a) => a.id === currentUserId);
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => openTaskById(t.id)}
        className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-edge hover:bg-surface"
      >
        <StatusIcon status={t.status} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink group-hover:text-tealhi">
            {t.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            <span className="font-mono">{t.code}</span>
            {due && (
              <span className={cn("font-medium", due.overdue ? "text-crimson" : due.today ? "text-amber" : "")}>
                {due.overdue ? "OVERDUE · " : ""}
                {due.text}
              </span>
            )}
            {mine && <span className="text-teal">· mine</span>}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <AssigneeAvatar name={t.assignees[0]?.name ?? null} size={20} />
        </span>
        <Badge text={t.priority} />
      </button>
    );
  }

  function renderProjectCard(p: CommandProject) {
    const buckets = bucketize(p.tasks);
    const counts: Record<string, number> = {};
    for (const s of STATUS_ORDER) counts[s] = buckets[s].length;
    const dueToday = p.tasks.filter(isDueToday).length;
    const overdue = p.tasks.filter(isOverdue).length;
    return (
      <Card key={p.id} className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-ink">{p.name}</span>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">
                {p.tasks.length}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
              {p.clientName && <span>Client: {p.clientName}</span>}
              <span>{STATUS_ORDER.map((s) => `${counts[s]} ${STATUS_LABELS[s]}`).join(" · ")}</span>
              {(dueToday > 0 || overdue > 0) && (
                <span className={cn("font-medium", overdue > 0 ? "text-crimson" : "text-amber")}>
                  {overdue > 0 ? `${overdue} overdue` : ""}
                  {overdue > 0 && dueToday > 0 ? " · " : ""}
                  {dueToday > 0 ? `${dueToday} due today` : ""}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => openCreate(p.id)}
            className="shrink-0 rounded-md bg-teal px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-tealhi"
          >
            + Add Task
          </button>
        </div>
        <div className="space-y-3 p-3">
          {(STATUS_ORDER as readonly string[]).map((s) =>
            buckets[s as StatusBucket].length > 0 ? (
              <div key={s}>
                <SectionLabel>{STATUS_LABELS[s]}</SectionLabel>
                <div className="mt-1 space-y-0.5">
                  {buckets[s as StatusBucket].map(renderTaskRow)}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* KPI header */}
      <div className="grid grid-cols-2 gap-2.5 p-4 pb-0 lg:grid-cols-4">
        <Stat label="Open tasks (mine + dept)" value={kpis.open} accent="text-teal" />
        <Stat label="Blocked" value={kpis.blocked} accent="text-crimson" />
        <Stat label="Due this week" value={kpis.dueThisWeek} accent="text-amber" />
        <Stat label="Active projects" value={kpis.activeProjects} accent="text-tealhi" />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Department filter">
          {deptOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDept(d)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition",
                dept === d
                  ? "bg-teal font-semibold text-white"
                  : "border border-edge bg-surface text-muted hover:text-ink",
              )}
            >
              {d === "all" ? "All depts" : d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Assignee filter">
          {(["all", "me"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAssignee(a)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition",
                assignee === a
                  ? "bg-teal font-semibold text-white"
                  : "border border-edge bg-surface text-muted hover:text-ink",
              )}
            >
              {a === "all" ? "Everyone" : "Mine"}
            </button>
          ))}
          <div className="w-44">
            <SearchableSelect
              options={[
                { value: "all", label: "Everyone" },
                { value: "me", label: "Assigned to me" },
                ...employees.map((e) => ({ value: e.id, label: e.name })),
              ]}
              value={assignee}
              onChange={(v) => setAssignee(v)}
              placeholder="Assignee…"
              ariaLabel="Assignee filter"
            />
          </div>
        </div>
      </div>

      {/* Project cards */}
      <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 xl:grid-cols-2">
        {visibleProjects.map(renderProjectCard)}
        {visibleUnlinked.length > 0 && (
          <Card key="__unlinked">
            <div className="border-b border-edge px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">Department Queue</span>
                <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">
                  {visibleUnlinked.length}
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                Tasks with no project — same status buckets below.
              </div>
            </div>
            <div className="space-y-3 p-3">
              {(() => {
                const buckets = bucketize(visibleUnlinked);
                return (STATUS_ORDER as readonly string[]).map((s) =>
                  buckets[s as StatusBucket].length > 0 ? (
                    <div key={s}>
                      <SectionLabel>{STATUS_LABELS[s]}</SectionLabel>
                      <div className="mt-1 space-y-0.5">
                        {buckets[s as StatusBucket].map(renderTaskRow)}
                      </div>
                    </div>
                  ) : null,
                );
              })()}
            </div>
          </Card>
        )}
        {visibleProjects.length === 0 && visibleUnlinked.length === 0 && (
          <Card>
            <div className="p-8 text-center text-[13px] text-muted">
              No tasks match these filters.
            </div>
          </Card>
        )}
      </div>

      <TaskDrawer
        task={openTask}
        open={openTask !== null}
        onClose={closeTaskDrawer}
        onStatus={changeStatus}
        onSubtask={toggleSubtask}
        employees={employees}
        currentUserId={currentUserId}
        canAssign={canAssign}
      />

      {openMissing && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-edge bg-raised px-4 py-2.5 text-[13px] text-ink shadow-2xl"
        >
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
        onClose={() => {
          setCreateOpen(false);
          setCreateProjectId(null);
        }}
        employees={employees}
        departments={departments}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        canAssign={canAssign}
        clients={clients}
        projects={allProjects}
        initialProjectId={createProjectId ?? undefined}
        onCreated={() => startTransition(() => router.refresh())}
      />

      {blockPromptId && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-raised p-4 shadow-2xl">
            <div className="text-[14px] font-semibold text-ink">Why is this blocked?</div>
            <p className="mt-1 text-[12px] text-muted">
              A blocker description is required to move a task to Blocked.
            </p>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
              placeholder="What is blocking this?"
              className="mt-2 w-full rounded-md border border-edge bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
            />
            {blockErr && (
              <p className="mt-1 text-[12px] text-crimson">Please describe the blocker first.</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBlockPromptId(null);
                  setBlockReason("");
                  setBlockErr(false);
                }}
                className="rounded-md px-3 py-1.5 text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={blockSaving}
                onClick={async () => {
                  if (!blockReason.trim()) {
                    setBlockErr(true);
                    return;
                  }
                  setBlockSaving(true);
                  await changeStatus(blockPromptId, "BLOCKED", blockReason.trim());
                  setBlockSaving(false);
                  setBlockPromptId(null);
                  setBlockReason("");
                  setBlockErr(false);
                }}
                className="rounded-md bg-teal px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-tealhi"
              >
                {blockSaving ? "Saving…" : "Mark Blocked"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
