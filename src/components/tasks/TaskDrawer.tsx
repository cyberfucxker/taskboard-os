"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X, Play, Check, Ban, Archive, RotateCcw, Flag, Plus, Pencil, Save, Clock, Link as LinkIcon, Copy, Check as CheckIcon, FolderDown, Trash2, Image as ImageIcon, Maximize2 } from "lucide-react";
import { Avatar, SectionLabel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { dueCountdown } from "@/lib/projectVisibility";
import { TASK_FLOW } from "@/lib/tasks";
import type { TaskView, ActivityFeedItem } from "@/components/tasks/types";
import { EntityLink } from "@/components/entity/EntityLink";
import { TaskReports } from "@/components/tasks/TaskReports";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { FlagTaskModal } from "@/components/tasks/FlagTaskModal";
import { MarkdownText } from "@/components/tasks/MarkdownText";
import {
  AssigneeAvatar,
  AssigneePicker,
  AssignToMeButton,
  canAssignToMe,
  DUE_TONE_COLOR,
  DuePicker,
  PRIORITY_META,
  PriorityIcon,
  PriorityPicker,
  STATUS_META,
  StatusIcon,
  StatusPicker,
  dueInfo,
  dueLabelFor,
  saveAssignee,
  saveDue,
  savePriority,
  saveStatus,
  useOptimisticTasks,
  type Priority,
  type Status,
} from "@/components/tasks/pickers";

const fieldCls =
  "w-full rounded-md border border-hover bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none";
const PRIO_ORDER = ["P0", "P1", "P2", "P3"] as const;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d`;
}

/**
 * Right-hand task drawer — the mockup's signature. Status flow is gated on
 * the state machine (TASK_FLOW), subtask ticks emit SUBTASK_TOGGLED events,
 * completing/reopening emit TASK_COMPLETED / TASK_REOPENED.
 * Now includes: add subtask UI, all assignees display, add-assignee button.
 */

// ── Quick due-date helpers ──────────────────────────────────────────────────
function _isoToday(): string { return new Date().toISOString().slice(0, 10); }
function _isoTomorrow(): string { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function _isoThisFriday(): string { const d = new Date(); const diff = (5 - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10); }
function _isoNextWeek(): string { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
function _fmtDue(iso: string): string { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
const _QUICK_DATES = [
  { label: "Today",       get: _isoToday },
  { label: "Tomorrow",    get: _isoTomorrow },
  { label: "This Friday", get: _isoThisFriday },
  { label: "Next Week",   get: _isoNextWeek },
] as const;
// ────────────────────────────────────────────────────────────────────────────

export function TaskDrawer({
  task: taskProp,
  open,
  onClose,
  onStatus,
  onSubtask,
  employees,
  currentUserId,
  canAssign,
  currentUserRole,
  inline = false,
}: {
  /** Render as a docked pane (no overlay, no close-on-outside-click, no S/P/A/D hotkeys): the list owns the keyboard. */
  inline?: boolean;
  task: TaskView | null;
  open: boolean;
  onClose: () => void;
  onStatus: (id: string, status: string, reason?: string) => Promise<void>;
  onSubtask: (taskId: string, subtaskId: string, done: boolean) => Promise<void>;
  employees?: { id: string; name: string }[];
  currentUserId?: string;
  canAssign?: boolean;
  currentUserRole?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: sessionData } = useSession();
  // Optimistic overlay: a status / priority / due / assignee pick shows at once
  // and is dropped when the server copy of the task catches up (or on failure).
  const sourceTasks = useMemo(() => (taskProp ? [taskProp] : []), [taskProp]);
  const { tasks: optimisticTasks, mutate } = useOptimisticTasks(sourceTasks);
  const task: TaskView | null = optimisticTasks[0] ?? null;
  // Which inline picker is open (S / P / A / D open them from the keyboard).
  const [pk, setPk] = useState<null | "status" | "priority" | "assignee" | "due">(null);
  const isTaskDeleteAdmin = sessionData?.user?.role === "SUPER_ADMIN";
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [savingSubtaskDesc, setSavingSubtaskDesc] = useState(false);
  const [showAddAssignee, setShowAddAssignee] = useState(false);
  const [copied, setCopied] = useState(false);
  // Phase A — edit mode. `draft` holds a working copy of the mutable fields.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    priority: "P2" as "P0" | "P1" | "P2" | "P3",
    due: "",
    estimateHrs: "",
    gainLever: "",
    outcome: "",
  });
  // Phase C — activity feed ("which assignee started/paused/completed/edited").
  const [recent, setRecent] = useState<ActivityFeedItem[]>([]);
  const [comments, setComments] = useState<{ id: string; body: string; createdAt: string; author: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [completionFlowOpen, setCompletionFlowOpen] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  // Reset the edit draft whenever a different task is opened; load the activity feed.
  useEffect(() => {
    if (open && task) {
      setEditing(false);
      setDraft({
        title: task.title,
        description: task.description ?? "",
        priority: task.priority,
        due: task.dueDate ? task.dueDate.slice(0, 10) : "",
        estimateHrs: task.estimateHrs != null ? String(task.estimateHrs) : "",
        gainLever: task.gainLever ?? "",
        outcome: task.outcome ?? "",
      });
      fetch(`/api/tasks/${task.id}?activity=1`)
        .then((res) => res.json())
        .then((data) => { if (data.ok) setRecent(data.recent ?? []); })
        .catch(() => setRecent([]));
      fetch(`/api/tasks/${task.id}/comments`)
        .then((res) => res.json())
        .then((data) => { if (data.ok) setComments(data.comments ?? []); })
        .catch(() => setComments([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, open]);

  // Realtime: keep the activity feed and comments current without touching the edit draft.
  useOnLiveChange(() => {
    if (!open || !task) return;
    fetch(`/api/tasks/${task.id}?activity=1`).then((r) => r.json()).then((d) => { if (d.ok) setRecent(d.recent ?? []); }).catch(() => {});
    fetch(`/api/tasks/${task.id}/comments`).then((r) => r.json()).then((d) => { if (d.ok) setComments(d.comments ?? []); }).catch(() => {});
  });

  // S / P / A / D open the pickers while the drawer is showing and no field has focus.
  const modalOpen = editing || completionFlowOpen;
  useEffect(() => {
    if (!open || !taskProp || modalOpen || inline) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || pk) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, select, textarea, [contenteditable='true'], [data-picker-content]")) return;
      const map: Record<string, "status" | "priority" | "assignee" | "due"> = { s: "status", p: "priority", a: "assignee", d: "due" };
      const kind = map[e.key.toLowerCase()];
      if (kind && e.key.length === 1) {
        e.preventDefault();
        setPk(kind);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, taskProp, modalOpen, pk]);

  async function copyLink() {
    const url = `${window.location.origin}/tasks/${task!.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast(`Link copied: ${url}`, "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Could not copy link", "error");
    }
  }

  const [aiRunning, setAiRunning] = useState(false);

  async function runAiAgent() {
    if (!task || aiRunning) return;
    setAiRunning(true);
    const res = await fetch("/api/agent/run-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    const data = await res.json();
    if (data.ok) {
      const gres = await fetch(`/api/tasks/${task.id}/comments`);
      const gdata = await gres.json();
      if (gdata.ok) setComments(gdata.comments ?? []);
      toast("AI agent responded", "success");
    } else {
      toast(data.error ?? "AI agent could not run", "error");
    }
    setAiRunning(false);
  }

  async function postComment() {
    const text = commentText.trim();
    if (!text || commentBusy) return;
    setCommentBusy(true);
    const res = await fetch(`/api/tasks/${task!.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const data = await res.json();
    if (data.ok) {
      setCommentText("");
      const gres = await fetch(`/api/tasks/${task!.id}/comments`);
      const gdata = await gres.json();
      if (gdata.ok) setComments(gdata.comments ?? []);
      toast("Comment posted", "success");
    } else {
      toast(data.error ?? "Could not post comment", "error");
    }
    setCommentBusy(false);
  }


  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.ok) return data.url;
    throw new Error(data.error);
  }

    async function handlePaste(
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    setter: (val: string) => void
  ) {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    let file: File | null = null;
    if (clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith("image/")) {
          file = item.getAsFile();
          if (file) break;
        }
      }
    }
    if (!file && clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        if (clipboardData.files[i].type.startsWith("image/")) {
          file = clipboardData.files[i];
          break;
        }
      }
    }

    if (file) {
      e.preventDefault();
      // Synchronously capture DOM properties before async network call
      const textarea = e.currentTarget;
      const start = textarea ? textarea.selectionStart : 0;
      const end = textarea ? textarea.selectionEnd : 0;
      const val = textarea ? textarea.value : "";

      try {
        toast("Uploading image...", "default");
        const url = await uploadFile(file);
        const markdown = `![image](${url})
`;
        const newVal = val.substring(0, start) + markdown + val.substring(end);
        setter(newVal);
        toast("Image pasted successfully", "success");
      } catch (err: any) {
        toast(err?.message || "Image upload failed", "error");
      }
    }
  }



  if (!open || !task) return null;

  const flow = TASK_FLOW[task.status] ?? [];
  const isLeaderOrCreator = Boolean(
    task.creatorId === currentUserId ||
    canAssign ||
    ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(currentUserRole ?? "")
  );
  const canSubmitForReview = task.status === "IN_PROGRESS";
  const canApprove = task.status === "IN_REVIEW" && isLeaderOrCreator;
  const canComplete = (flow.includes("DONE") && isLeaderOrCreator) || task.status === "IN_REVIEW";
  const canReopen = task.status === "DONE";
  const canStart = flow.includes("IN_PROGRESS");
  const canBlock = flow.includes("BLOCKED");
  // Permission model (A): assigner, or self-assignee, or leadership.
  const canEdit = Boolean(
    task.creatorId === currentUserId ||
    task.assignees.some((a) => a.id === currentUserId) ||
    canAssign
  );

  // Inline pickers: optimistic, rolled back with a toast if the server refuses.
  const afterPick = (ok: boolean) => { if (ok) router.refresh(); };
  const pickStatus = (status: Status, reason?: string) => {
    const t = task!;
    const toReview = status === "DONE" && !isLeaderOrCreator;
    const effective: Status = toReview ? "IN_REVIEW" : status;
    void mutate(
      t.id,
      { status: effective, blocked: effective === "BLOCKED", blockerReason: effective === "BLOCKED" ? reason ?? null : null },
      () => saveStatus(t.id, status, reason),
      toReview ? "Sent for review: a lead will approve it" : undefined
    ).then(afterPick);
  };
  const pickPriority = (p: Priority) => {
    void mutate(task!.id, { priority: p }, () => savePriority(task!.id, p)).then(afterPick);
  };
  const pickDue = (iso: string | null) => {
    void mutate(
      task!.id,
      { dueDate: iso ? `${iso}T00:00:00.000Z` : null, dueLabel: dueLabelFor(iso) },
      () => saveDue(task!.id, iso)
    ).then(afterPick);
  };
  const pickAssignee = (e: { id: string; name: string }) => {
    const t = task!;
    void mutate(
      t.id,
      { assigneeId: e.id, assignee: e.name, assignees: [{ id: e.id, name: e.name }, ...t.assignees.filter((a) => a.id !== e.id)] },
      () => saveAssignee(t.id, e.id),
      e.id === currentUserId ? "Assigned to you" : undefined
    ).then(afterPick);
  };
  const pickerBtn =
    "inline-flex min-h-[32px] items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal disabled:cursor-default disabled:hover:bg-transparent";
  const due = dueInfo(task);
  const cd = dueCountdown(task.dueDate);
  const primaryAssigneeName = task.assignee ?? task.assignees[0]?.name ?? null;

  async function saveEdit() {
    if (saving) return;
    setSaving(true);
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        priority: draft.priority,
        dueDate: draft.due || null,
        estimateHrs: draft.estimateHrs ? Number(draft.estimateHrs) : null,
        gainLever: draft.gainLever.trim() || null,
        outcome: draft.outcome.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setEditing(false);
      router.refresh();
      toast("Task updated", "success");
    } else {
      toast(data.error ?? "Update failed", "error");
    }
  }

  async function addSubtask() {
    if (!newSubtask.trim() || addingSub) return;
    setAddingSub(true);
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_subtask", title: newSubtask.trim() }),
    });
    const data = await res.json();
    setAddingSub(false);
    if (data.ok) {
      setNewSubtask("");
      router.refresh();
    } else {
      toast(data.error ?? "Failed to add subtask", "error");
    }
  }

  function startEditSubtaskDesc(s: { id: string; description?: string | null }) {
    setEditingSubtaskId(s.id);
    setSubtaskDraft(s.description ?? "");
  }

  function cancelEditSubtaskDesc() {
    setEditingSubtaskId(null);
    setSubtaskDraft("");
  }

  async function saveSubtaskDesc(subtaskId: string) {
    if (savingSubtaskDesc) return;
    setSavingSubtaskDesc(true);
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit_subtask", subtaskId, description: subtaskDraft.trim() || null }),
    });
    const data = await res.json();
    setSavingSubtaskDesc(false);
    if (data.ok) {
      setEditingSubtaskId(null);
      setSubtaskDraft("");
      router.refresh();
    } else {
      toast(data.error ?? "Failed to update subtask", "error");
    }
  }

  async function addAssigneeToTask(employeeId: string) {
    if (!employeeId || employeeId === currentUserId) return;
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_assignee", employeeId }),
    });
    const data = await res.json();
    if (data.ok) {
      setShowAddAssignee(false);
      router.refresh();
    } else {
      toast(data.error ?? "Failed to add assignee", "error");
    }
  }

  async function removeAssigneeFromTask(employeeId: string) {
    if (!employeeId || !window.confirm("Remove this assignee from the task?")) return;
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_assignee", employeeId }),
    });
    const data = await res.json();
    if (data.ok) router.refresh();
    else toast(data.error ?? "Failed to remove assignee", "error");
  }

  async function archiveCurrent() {
    if (!window.confirm("Archive this task? It stays in the Archived tab and can be restored.")) return;
    const res = await fetch(`/api/tasks/${task!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", archived: true }),
    });
    const data = await res.json();
    if (data.ok) {
      router.refresh();
      onClose();
    } else toast(data.error ?? "Failed to archive", "error");
  }

  async function deleteTask() {
    if (!task) return;
    const confirmed = window.confirm(`⚠️ DANGER (COO ONLY): Permanently delete task ${task.code} ("${task.title}")?\n\nThis will remove the task and close all work sessions. This cannot be undone.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(`Task ${task.code} deleted successfully`, "success");
        onClose();
        router.refresh();
      } else {
        toast(data.error ?? "Failed to delete task", "error");
      }
    } catch {
      toast("Error deleting task", "error");
    }
  }

  const currentAssigneeIds = task.assignees.map((a) => a.id);
  const availableForAssign = (employees ?? []).filter((e) => !currentAssigneeIds.includes(e.id));

  return (
    <div
      {...(inline ? { "data-task-peek": "" } : { "data-task-drawer": "" })}
      className={inline ? "flex h-full min-h-0 w-full" : "fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-sm anim-fade"}
      onMouseDown={inline ? undefined : onClose}
    >
      <div
        className={inline
          ? "flex h-full w-full min-w-0 flex-col overflow-hidden bg-raised"
          : "flex h-full w-full sm:max-w-3xl lg:max-w-5xl flex-col overflow-hidden border-l border-hover bg-raised shadow-2xl anim-right"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-hover bg-bg/80 px-4 py-3 sm:px-6 sm:py-4 gap-2">
          <div className="min-w-0 flex-1 mr-4">
            <div className="flex items-center gap-2 mb-1">
              <Link
                href={`/tasks/${task.code}`}
                title="Open as a full page"
                className="font-mono text-[12px] font-semibold text-muted hover:text-ink hover:underline"
              >
                {task.code}
              </Link>
              <StatusPicker value={task.status} onChange={pickStatus} open={pk === "status"} onOpenChange={(o) => setPk(o ? "status" : null)}>
                <button type="button" className={pickerBtn} aria-label={`Status: ${STATUS_META[task.status].label}`}>
                  <StatusIcon status={task.status} />
                  <span>{STATUS_META[task.status].label}</span>
                </button>
              </StatusPicker>
              <PriorityPicker value={task.priority} onChange={pickPriority} disabled={!canEdit} open={pk === "priority"} onOpenChange={(o) => setPk(o ? "priority" : null)}>
                <button type="button" disabled={!canEdit} className={pickerBtn} aria-label={`Priority: ${PRIORITY_META[task.priority].label}`}>
                  <PriorityIcon priority={task.priority} />
                  <span>{PRIORITY_META[task.priority].label}</span>
                </button>
              </PriorityPicker>
              {task.department && (
                <Link
                  href={`/tasks?dept=${encodeURIComponent(task.department)}`}
                  className="rounded bg-hover px-2 py-0.5 text-[12px] text-muted hover:text-ink"
                >
                  {task.department}
                </Link>
              )}
            </div>
            <h2 className="text-[18px] font-semibold leading-snug text-ink">{task.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hover bg-raised px-2.5 py-0.5 text-[11px] text-muted">
                <span>Created by</span>
                {task.creatorId && task.creatorName ? (
                  <EntityLink entity={{ type: "person", id: task.creatorId, name: task.creatorName }} className="text-[11px] font-semibold" />
                ) : (
                  <span className="font-semibold text-ink">{task.creatorName || "Lead"}</span>
                )}
              </span>
              <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-hover bg-raised px-2.5 py-0.5 text-[11px] text-muted">
                <span>Assignees:</span>
                {task.assignees.length > 0 ? (
                  task.assignees.map((a, i) => (
                    <span key={a.id}>
                      <EntityLink entity={{ type: "person", id: a.id, name: a.name }} className="text-[11px] font-semibold" />
                      {i < task.assignees.length - 1 ? "," : ""}
                    </span>
                  ))
                ) : (
                  <span className="font-semibold text-tealhi">{task.assignee || "Unassigned"}</span>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTaskDeleteAdmin && (
              <button
                onClick={deleteTask}
                title="Permanently delete task (super admins only)"
                aria-label="Delete task"
                className="flex items-center gap-1.5 rounded-md border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[12px] font-medium text-crimson hover:bg-crimson/20 hover:border-crimson/60 transition shadow-sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setEditing((e) => !e)}
                title={editing ? "Cancel editing" : "Edit task"}
                aria-label="Edit task"
                className="flex items-center gap-1.5 rounded-md border border-hover bg-raised px-3 py-1.5 text-[12px] text-muted hover:border-teal hover:text-ink transition"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
              </button>
            )}
            <Link
              href={`/tasks/${task.code}`}
              title="Open as a full page"
              aria-label="Open full page"
              className="flex items-center gap-1.5 rounded-md border border-hover bg-raised px-3 py-1.5 text-[12px] text-muted hover:border-teal hover:text-ink transition"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </Link>
            <button
              onClick={copyLink}
              title="Copy link to this task"
              className="flex items-center gap-1.5 rounded-md border border-hover bg-raised px-3 py-1.5 text-[12px] text-muted hover:border-teal hover:text-ink transition"
              aria-label="Copy link"
            >
              {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald" /> : <LinkIcon className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Link"}</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Responsive Body */}
        <div className="flex-1 overflow-y-auto main-scrollable pb-safe">
          <div className={inline ? "grid grid-cols-1 min-h-full" : "grid grid-cols-1 lg:grid-cols-12 min-h-full"}>
            {/* Left / Main Content Column (7/12) */}
            <div className={inline ? "p-5 space-y-6" : "lg:col-span-7 xl:col-span-8 p-6 space-y-6"}>
              {/* Description */}
              <div>
                <SectionLabel>Description</SectionLabel>
                {task.description ? (
                  <div className="mt-2 text-[14px] leading-relaxed text-ink2 bg-bg/50 rounded-lg p-3.5 border border-hover/60">
                    <MarkdownText text={task.description} />
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] italic text-faint">No description provided.</p>
                )}
                {(task as any).descriptionByName && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    — {(task as any).descriptionByName}
                  </p>
                )}
              </div>

              {/* Definition of Done / Outcome */}
              {task.outcome && (
                <div>
                  <SectionLabel>What done looks like</SectionLabel>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted bg-bg/40 rounded-lg p-3 border border-hover/40">
                    {task.outcome}
                  </p>
                </div>
              )}

              {/* Subtasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SectionLabel>Subtasks</SectionLabel>
                    {task.subtasks.length > 0 && (
                      <span className="font-mono text-[11px] text-muted">
                        {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} done
                      </span>
                    )}
                  </div>
                  {task.subtasks.length > 0 && (
                    <span className="font-mono text-[11px] text-tealhi">
                      {Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100)}%
                    </span>
                  )}
                </div>

                {/* Subtasks list */}
                <div className="space-y-1.5 rounded-lg border border-hover/80 bg-bg/50 p-2.5">
                  {task.subtasks.length === 0 && (
                    <p className="py-2 text-center text-[12px] text-faint">No subtasks yet.</p>
                  )}
                  {task.subtasks.map((s) => {
                    const isEditingDesc = editingSubtaskId === s.id;
                    return (
                      <div key={s.id} className="rounded-md p-2 hover:bg-raised transition-colors border border-transparent hover:border-hover">
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => onSubtask(task.id, s.id, !s.done)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left py-1"
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[11px] font-bold transition-all ${
                                s.done ? "border-emerald bg-emerald text-bg" : s.status === "IN_REVIEW" ? "border-amber bg-amber text-bg" : "border-edge text-transparent"
                              }`}
                            >
                              {s.status === "IN_REVIEW" && !s.done ? "?" : "✓"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[13px] ${s.done ? "text-muted line-through" : s.status === "IN_REVIEW" ? "text-amber" : "text-ink"}`}>
                                {s.title} {s.status === "IN_REVIEW" && !s.done && <span className="ml-2 text-[10px] uppercase font-bold text-amber bg-amber/10 px-1 py-0.5 rounded">In Review</span>}
                              </span>
                              {s.description && !isEditingDesc && (
                                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{s.description}</span>
                              )}
                            </span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditSubtaskDesc(s); }}
                            title={s.description ? "Edit description" : "Add description"}
                            aria-label={s.description ? "Edit subtask description" : "Add subtask description"}
                            className="shrink-0 text-muted hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isEditingDesc && (
                          <div className="ml-6 mt-2 space-y-2">
                            <textarea
                              autoFocus
                              rows={2}
                              value={subtaskDraft}
                              onChange={(e) => setSubtaskDraft(e.target.value)}
                              placeholder="Add a description…"
                              className={`${fieldCls} resize-none`}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={cancelEditSubtaskDesc}
                                className="rounded-md border border-hover px-2.5 py-1 text-[11px] text-muted hover:bg-bg"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveSubtaskDesc(s.id)}
                                disabled={savingSubtaskDesc}
                                className="rounded-md bg-tealhi px-2.5 py-1 text-[11px] font-semibold text-bg hover:bg-emerald disabled:opacity-50"
                              >
                                {savingSubtaskDesc ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add subtask input */}
                  <div className="mt-2 flex items-center gap-2 pt-1 border-t border-hover/60">
                    <input
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                      placeholder="Add a subtask…"
                      className="flex-1 rounded-md border border-hover bg-raised px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                    />
                    <button
                      onClick={addSubtask}
                      disabled={!newSubtask.trim() || addingSub}
                      className="rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Task Reports / Deliverables */}
              <div className="rounded-lg border border-hover/80 bg-bg/30 p-4">
                <TaskReports
                  taskId={task.id}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  open={open}
                />
              </div>

              {/* Comments Thread — fully visible */}
              <div>
                <div className="flex items-center justify-between">
                  <SectionLabel>Comments ({comments.length})</SectionLabel>
                  <button
                    onClick={runAiAgent}
                    disabled={aiRunning}
                    title="Run this task's assignee AI agent (configured under Settings -> Integrations)"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-teal/15 text-tealhi border border-teal/30 hover:bg-teal/25 transition-colors disabled:opacity-50"
                  >
                    <span>{aiRunning ? "Running AI Agent..." : "Run AI Agent"}</span>
                  </button>
                </div>
                {comments.length === 0 ? (
                  <p className="mt-2 text-[12px] text-faint">No comments yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {comments.map((c) => (
                      <li key={c.id} className="rounded-lg bg-bg/60 border border-hover/70 p-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={c.author} size={20} />
                          <span className="text-[13px] font-medium text-ink">{c.author}</span>
                          <span className="font-mono text-[11px] text-faint">{timeAgo(c.createdAt)}</span>
                        </div>
                        <div className="mt-1.5 text-[13px] leading-relaxed text-ink">
                          <MarkdownText text={c.body} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 relative">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onPaste={(e) => handlePaste(e, setCommentText)}
                        placeholder="Add a comment… (⌘↵ to post, paste images with Ctrl+V)"
                        rows={3}
                        className={`${fieldCls} w-full resize-none pb-8`}
                        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") postComment(); }}
                      />
                      <label className="absolute bottom-2 left-2 flex items-center gap-1.5 cursor-pointer text-muted hover:text-tealhi transition px-2 py-1 rounded bg-bg border border-hover">
                        <ImageIcon className="h-3 w-3" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">Attach</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const url = await uploadFile(file);
                                setCommentText((prev) => (prev ? prev + "\n" : "") + `![image](${url})`);
                              } catch {}
                            }
                          }}
                        />
                      </label>
                    </div>
                    <button
                      onClick={postComment}
                      disabled={commentBusy || !commentText.trim()}
                      className="h-full min-h-[74px] shrink-0 rounded-md bg-teal px-4 text-[13px] font-medium text-bg hover:bg-tealhi disabled:opacity-40 transition"
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right / Sidebar Column (5/12) */}
            <div className={inline ? "border-t border-hover bg-bg/40 p-5 space-y-5" : "lg:col-span-5 xl:col-span-4 border-t lg:border-t-0 lg:border-l border-hover bg-bg/40 p-6 space-y-5"}>
              {/* Properties Grid */}
              <div className="space-y-4 rounded-xl border border-hover bg-raised/60 p-4">
                <SectionLabel>Properties</SectionLabel>

                {/* Assignees */}
                <Meta label={`Assignees (${task.assignees.length})`}>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {task.assignees.map((a) => {
                      const effectiveRole = currentUserRole || (sessionData?.user as any)?.role;
                      const RESTRICTED_ROLES = [
                        "EXECUTIVE",
                        "INTERN",
                        "EXTERNAL_CONTRACTOR",
                        "CLIENT_ADMIN",
                        "CLIENT_VIEWER",
                      ];
                      const isExecutiveOrBelow = RESTRICTED_ROLES.includes(effectiveRole ?? "");
                      const canRemoveAssignee = Boolean((effectiveRole && !isExecutiveOrBelow) || canAssign);

                      return (
                        <span
                          key={a.id}
                          className="group/assignee flex items-center gap-1.5 rounded-full bg-hover px-2.5 py-1 text-[12px] text-ink transition hover:bg-edge"
                        >
                          <Avatar name={a.name} size={16} />
                          <EntityLink entity={{ type: "person", id: a.id, name: a.name }} />
                          {canRemoveAssignee && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAssigneeFromTask(a.id);
                              }}
                              title={`Remove ${a.name}`}
                              aria-label={`Remove ${a.name}`}
                              className="ml-0.5 rounded-full p-0.5 text-muted transition hover:bg-crimson/20 hover:text-crimson"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {canAssign && (
                      <div className="relative">
                        <button
                          onClick={() => setShowAddAssignee(!showAddAssignee)}
                          className="flex items-center gap-1 rounded-full border border-dashed border-edge px-2.5 py-1 text-[11px] text-muted hover:border-teal hover:text-teal"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                        {showAddAssignee && availableForAssign.length > 0 && (
                          <div className="absolute left-0 z-50 mt-1 max-h-48 w-48 overflow-y-auto rounded-lg border border-hover bg-bg shadow-2xl">
                            {availableForAssign.map((e) => (
                              <button
                                key={e.id}
                                onClick={() => addAssigneeToTask(e.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-ink hover:bg-hover"
                              >
                                <Avatar name={e.name} size={16} />
                                {e.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Meta>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-hover/60">
                  <Meta label="Department">
                    {task.department ? (
                      <EntityLink entity={{ type: "department", id: task.department, name: task.department }} className="text-[13px]" />
                    ) : (
                      <span className="text-[13px]" style={{ color: task.departmentColor ?? "var(--muted)" }}>—</span>
                    )}
                  </Meta>
                  <Meta label="Due">
                    <DuePicker value={task.dueDate} onChange={pickDue} disabled={!canEdit} open={pk === "due"} onOpenChange={(o) => setPk(o ? "due" : null)}>
                      <button type="button" disabled={!canEdit} className={`${pickerBtn} -ml-1.5 font-mono`} style={{ color: cd?.overdue ? "var(--crimson)" : due ? DUE_TONE_COLOR[due.tone] : "var(--muted)" }}>
                        {cd ? (cd.overdue ? `OVERDUE · ${cd.text}` : cd.text) : "No due date"}
                      </button>
                    </DuePicker>
                  </Meta>
                  <Meta label="Client">
                    {task.clientId && task.clientName ? (
                      <EntityLink entity={{ type: "client", id: task.clientId, name: task.clientName }} className="text-[13px]" />
                    ) : (
                      <span className="text-[13px] text-ink">Internal</span>
                    )}
                  </Meta>
                  {task.projectId && task.projectName && (
                    <Meta label="Project">
                      <EntityLink entity={{ type: "project", id: task.projectId, name: task.projectName }} className="text-[13px]" />
                    </Meta>
                  )}
                  <Meta label="Lever">
                    <span className="font-mono text-[13px] text-tealhi">{task.gainLever ?? "—"}</span>
                  </Meta>
                  {task.estimateHrs != null && (
                    <Meta label="Estimate">
                      <span className="font-mono text-[13px] text-ink">
                        {`${task.estimateHrs}h`}
                      </span>
                    </Meta>
                  )}
                </div>
              </div>

              {/* Blocker alert */}
              {task.blocked && (
                <div className="rounded-lg border border-crimson/40 bg-crimson/10 p-3.5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-crimson">
                    <Flag className="h-4 w-4 fill-crimson text-crimson" /> Flagged as Blocked (⚑)
                  </div>
                  {task.blockerReason && <p className="mt-1.5 text-[12px] text-ink leading-relaxed">{task.blockerReason}</p>}
                </div>
              )}

              {/* Activity feed */}
              {recent.length > 0 && (
                <div className="rounded-xl border border-hover bg-raised/60 p-4">
                  <SectionLabel>Recent activity</SectionLabel>
                  <ul className="mt-2.5 space-y-2">
                    {recent.map((a, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-[12px]">
                        <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-teal" />
                        <span className="min-w-0 flex-1 text-ink">
                          <span className="text-ink font-medium">{a.actor ?? "Someone"}</span> {actLabel(a)}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-faint">{fmtDate(a.at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Edit modal */}
          {editing && (
            <div
              className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-sm anim-fade"
              onMouseDown={() => setEditing(false)}
            >
              <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto space-y-4 rounded-xl border border-teal/30 bg-raised p-5 shadow-2xl anim-up"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <SectionLabel>Edit task</SectionLabel>
                  <span className="font-mono text-[10px] text-muted">{task.code}</span>
                </div>
                <div>
                  <div className="label mb-1">Title</div>
                  <input
                    className={fieldCls}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Task title"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="label">Description</div>
                    <label className="cursor-pointer text-[11px] text-muted hover:text-tealhi flex items-center gap-1.5 transition">
                      <ImageIcon className="h-3.5 w-3.5" /> Attach Image
                      <input
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const url = await uploadFile(file);
                              setDraft((prev) => ({ ...draft, description: (prev.description ? prev.description + "\n" : "") + `![image](${url})` }));
                            } catch {}
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div
                    className="relative"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={async (e) => {
                      e.preventDefault(); e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith("image/")) {
                        try {
                          const url = await uploadFile(file);
                          setDraft((prev) => ({ ...draft, description: (prev.description ? prev.description + "\n" : "") + `![image](${url})` }));
                        } catch {}
                      }
                    }}
                  >
                    <textarea
                      className={`${fieldCls} resize-none`}
                      rows={5}
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      onPaste={(e) => handlePaste(e, (val) => setDraft({ ...draft, description: val }))}
                      placeholder="Add a description… (drop files or paste images)"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label mb-1">Priority</div>
                    <select
                      className={fieldCls}
                      value={draft.priority}
                      onChange={(e) => setDraft({ ...draft, priority: e.target.value as "P0" | "P1" | "P2" | "P3" })}
                    >
                      {PRIO_ORDER.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <div className="label mb-2">Due date</div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {_QUICK_DATES.map(({ label, get }) => {
                        const val = get();
                        const active = draft.due === val;
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setDraft({ ...draft, due: active ? "" : val })}
                            className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${active ? "border-teal/40 bg-teal/20 text-teal" : "border-hover bg-bg text-muted hover:border-teal/40 hover:text-teal"}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="date"
                      className={fieldCls}
                      value={draft.due}
                      onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                    />
                    {draft.due && (
                      <p className="mt-1.5 text-[12px] text-teal">{_fmtDue(draft.due)}</p>
                    )}
                  </div>
                  <div>
                    <div className="label mb-1">Estimate (h)</div>
                    <input
                      type="number"
                      min="0"
                      className={fieldCls}
                      value={draft.estimateHrs}
                      onChange={(e) => setDraft({ ...draft, estimateHrs: e.target.value })}
                      placeholder="hours"
                    />
                  </div>
                  <div>
                    <div className="label mb-1">Lever</div>
                    <input
                      className={fieldCls}
                      value={draft.gainLever}
                      onChange={(e) => setDraft({ ...draft, gainLever: e.target.value })}
                      placeholder="e.g. L1-Activation"
                    />
                  </div>
                </div>
                <div>
                  <div className="label mb-1">What done looks like (outcome)</div>
                  <textarea
                    className={`${fieldCls} resize-none`}
                    rows={2}
                    value={draft.outcome}
                    onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
                    placeholder="Definition of done…"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-md border border-hover px-3 py-1.5 text-[12px] text-muted hover:bg-bg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving || !draft.title.trim()}
                    className="flex items-center gap-1.5 rounded-md bg-tealhi px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:bg-emerald disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions — the status state machine */}
        <div className="flex gap-2 border-t border-hover px-4 py-3">
          {canStart && task.status !== "IN_PROGRESS" && (
            <FlowButton onClick={() => onStatus(task.id, "IN_PROGRESS")} color="var(--tealhi)" icon={<Play className="h-4 w-4" />}>
              Mark In Progress
            </FlowButton>
          )}
          {task.status === "IN_PROGRESS" && !isLeaderOrCreator && (
            <FlowButton onClick={() => setCompletionFlowOpen(true)} color="var(--amber)" icon={<Check className="h-4 w-4" />}>
              Submit for Approval
            </FlowButton>
          )}
          {task.status === "IN_PROGRESS" && isLeaderOrCreator && (
            <FlowButton onClick={() => setCompletionFlowOpen(true)} color="var(--emerald)" icon={<Check className="h-4 w-4" />}>
              Complete
            </FlowButton>
          )}
          {task.status === "IN_REVIEW" && isLeaderOrCreator && (
            <>
              <FlowButton onClick={() => setCompletionFlowOpen(true)} color="var(--emerald)" icon={<Check className="h-4 w-4" />}>
                Approve & Complete
              </FlowButton>
              <FlowButton onClick={() => onStatus(task.id, "IN_PROGRESS", "Changes requested by approver")} color="var(--crimson)" icon={<RotateCcw className="h-4 w-4" />}>
                Request Changes
              </FlowButton>
            </>
          )}
          {task.status === "IN_REVIEW" && !isLeaderOrCreator && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber/10 text-amber border border-amber/20">
              ⏳ Pending Approval from Creator
            </span>
          )}
          {canReopen && (
            <FlowButton onClick={() => onStatus(task.id, "IN_PROGRESS")} color="var(--amber)" icon={<RotateCcw className="h-4 w-4" />}>
              Reopen
            </FlowButton>
          )}
          {canBlock && !task.blocked && task.status !== "DONE" && (
            <FlowButton onClick={() => setFlagModalOpen(true)} color="var(--crimson)" icon={<Flag className="h-4 w-4 text-crimson" />}>
              Flag Blocker (⚑)
            </FlowButton>
          )}
          {task.blocked && (
            <FlowButton onClick={() => onStatus(task.id, "IN_PROGRESS", "Blocker resolved")} color="var(--tealhi)" icon={<RotateCcw className="h-4 w-4" />}>
              Unblock & Resume
            </FlowButton>
          )}
          {canEdit && (
            <FlowButton onClick={archiveCurrent} color="var(--muted)" icon={<Archive className="h-4 w-4" />}>
              Archive
            </FlowButton>
          )}
          <span className="ml-auto self-center font-mono text-[11px] text-edge">
            {task.status}
          </span>
        </div>
      </div>
      {completionFlowOpen && task && (
        <CompleteTaskModal
          taskId={task.id}
          taskCode={task.code}
          taskTitle={task.title}
          isLeaderOrCreator={isLeaderOrCreator}
          open={completionFlowOpen}
          onClose={() => setCompletionFlowOpen(false)}
          onCompleted={() => {
            setCompletionFlowOpen(false);
            onClose(); // Close the drawer, task is done
          }}
        />
      )}
      {flagModalOpen && task && (
        <FlagTaskModal
          taskId={task.id}
          taskCode={task.code}
          taskTitle={task.title}
          currentReason={task.blockerReason}
          open={flagModalOpen}
          onClose={() => setFlagModalOpen(false)}
          onFlagged={() => {
            setFlagModalOpen(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function actLabel(a: ActivityFeedItem): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "TASK_CREATED":
      return `created task ${a.payload && (p as { code?: string }).code ? (p as { code: string }).code : ""}`.trim();
    case "TASK_STARTED":
      return "started working";
    case "TASK_PAUSED":
      return `paused (${String(p.from ?? "")} → ${String(p.to ?? "TODO")}${p.reason ? ` — ${p.reason}` : ""})`;
    case "TASK_COMPLETED":
      return "completed this task";
    case "TASK_REOPENED":
      return "reopened this task";
    case "TASK_BLOCKED":
    case "TASK_STATUS_CHANGED":
      return `moved ${String(p.from ?? "")} → ${String(p.to ?? "")}`.trim();
    case "TASK_UPDATED": {
      const fields = Array.isArray(p.fields) ? (p.fields as string[]).join(", ") : "fields";
      return `edited ${fields}`;
    }
    case "SUBTASK_TOGGLED":
      return `marked a subtask ${p.done ? "done" : "not done"}`;
    default:
      return (a.type || "did something").toLowerCase().replace(/_/g, " ");
  }
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function FlowButton({
  onClick, color, icon, children,
}: { onClick: () => void; color: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition hover:opacity-85"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
