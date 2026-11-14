"use client";

/**
 * TaskDetail — the full-page task document at /tasks/[id] (Linear style).
 *
 *  - thin header: Tasks / project / short ID, "n / total" up-down stepper
 *    (list order handed over through sessionStorage), copy link
 *  - left: big editable title, description, sub-tasks, deliverables, and the
 *    Activity timeline (small muted events, bordered comment cards) + composer
 *  - right: a quiet property column; entities are links, status / priority /
 *    assignee / due are inline pickers (same optimistic path as the list)
 *
 * Data arrives from the server page; the realtime provider refreshes the page
 * when anything changes, so activity and comments stay current by themselves.
 * Keys (no field focused): J / K next / previous task, S P A D pickers, Esc back.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Link as LinkIcon,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Avatar, SectionLabel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { StarButton } from "@/components/StarButton";
import { TrackRecent } from "@/components/TrackRecent";
import type { TaskView } from "@/components/tasks/types";
import { MarkdownText } from "@/components/tasks/MarkdownText";
import { TaskReports } from "@/components/tasks/TaskReports";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
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
  TASK_ORDER_KEY,
  dueInfo,
  dueLabelFor,
  saveAssignee,
  saveDescription,
  saveDue,
  savePriority,
  saveStatus,
  saveTitle,
  useOptimisticTasks,
  type Priority,
  type Status,
} from "@/components/tasks/pickers";
import { describeActivity, timeAgo } from "./activity";

export interface DetailComment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  author: string;
}
export interface DetailActivity {
  id: string;
  type: string;
  actor: string | null;
  actorId: string | null;
  at: string;
  payload: unknown;
}

type PickerKey = null | "status" | "priority" | "assignee" | "due";

const LEADER_ROLES = ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "TEAM_LEAD"];

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

export function TaskDetail({
  task: taskProp,
  comments,
  activity,
  employees,
  currentUserId,
  currentUserName,
  currentUserRole,
  canAssign,
}: {
  task: TaskView;
  comments: DetailComment[];
  activity: DetailActivity[];
  employees: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  canAssign: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const sourceTasks = useMemo(() => [taskProp], [taskProp]);
  const { tasks: optimistic, mutate } = useOptimisticTasks(sourceTasks);
  const task = optimistic[0];

  const [pk, setPk] = useState<PickerKey>(null);
  const [completeOpen, setCompleteOpen] = useState(false);

  const isLeaderOrCreator = canAssign || task.creatorId === currentUserId || LEADER_ROLES.includes(currentUserRole ?? "");
  const canEdit = canAssign || task.creatorId === currentUserId || task.assignees.some((a) => a.id === currentUserId);

  /* ───────────────────────────── list stepper (n / total) ───────────────── */

  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TASK_ORDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOrder(parsed.filter((x) => typeof x === "string"));
      }
    } catch { /* no list order: the stepper simply stays hidden */ }
  }, []);
  const idx = order.indexOf(task.code);
  const prevCode = idx > 0 ? order[idx - 1] : null;
  const nextCode = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || pk || completeOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, select, textarea, [contenteditable='true'], [data-picker-content], [role='dialog']")) return;
      const k = e.key.toLowerCase();
      if (k === "j" && nextCode) { e.preventDefault(); router.push(`/tasks/${nextCode}`); }
      else if (k === "k" && prevCode) { e.preventDefault(); router.push(`/tasks/${prevCode}`); }
      else if (e.key === "Escape") { router.push("/tasks"); }
      else if (e.key.length === 1 && "spad".includes(k)) {
        e.preventDefault();
        setPk(({ s: "status", p: "priority", a: "assignee", d: "due" } as const)[k as "s" | "p" | "a" | "d"]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pk, completeOpen, nextCode, prevCode, router]);

  /* ───────────────────────────── inline mutations ───────────────────────── */

  const afterOk = (ok: boolean) => { if (ok) router.refresh(); };

  const pickStatus = (status: Status, reason?: string) => {
    const toReview = status === "DONE" && !isLeaderOrCreator;
    const effective: Status = toReview ? "IN_REVIEW" : status;
    void mutate(
      task.id,
      { status: effective, blocked: effective === "BLOCKED", blockerReason: effective === "BLOCKED" ? reason ?? null : null },
      () => saveStatus(task.id, status, reason),
      toReview ? "Sent for review: a lead will approve it" : undefined
    ).then(afterOk);
  };
  const pickPriority = (p: Priority) => void mutate(task.id, { priority: p }, () => savePriority(task.id, p)).then(afterOk);
  const pickDue = (iso: string | null) =>
    void mutate(task.id, { dueDate: iso ? `${iso}T00:00:00.000Z` : null, dueLabel: dueLabelFor(iso) }, () => saveDue(task.id, iso)).then(afterOk);
  const pickAssignee = (e: { id: string; name: string }) =>
    void mutate(
      task.id,
      { assigneeId: e.id, assignee: e.name, assignees: [{ id: e.id, name: e.name }, ...task.assignees.filter((a) => a.id !== e.id)] },
      () => saveAssignee(task.id, e.id),
      e.id === currentUserId ? "Assigned to you" : undefined
    ).then(afterOk);


  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tasks/${task.code}`);
      toast("Link copied", "success");
    } catch {
      toast("Could not copy link", "error");
    }
  }

  /* ───────────────────────────────── description ────────────────────────── */

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  function startDesc() {
    if (!canEdit) return;
    setDescDraft(task.description ?? "");
    setEditingDesc(true);
  }
  function saveDesc() {
    const next = descDraft.trim() || null;
    setEditingDesc(false);
    if (next === (task.description ?? null)) return;
    void mutate(task.id, { description: next }, () => saveDescription(task.id, next)).then(afterOk);
  }

  /* ───────────────────────────────── sub-tasks ──────────────────────────── */

  const [subs, setSubs] = useState(task.subtasks);
  useEffect(() => setSubs(task.subtasks), [task.subtasks]);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  async function toggleSub(id: string, done: boolean) {
    const before = subs;
    setSubs((p) => p.map((s) => (s.id === id ? { ...s, done } : s)));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subtask", subtaskId: id, done }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Sub-task update failed");
      // The server may route a non-lead's "done" to review instead; show what it decided.
      setSubs((p) => p.map((s) => (s.id === id ? { ...s, done: Boolean(data.done), status: data.status } : s)));
      router.refresh();
    } catch (e) {
      setSubs(before);
      toast((e as Error).message, "error");
    }
  }

  async function addSub() {
    const title = newSub.trim();
    if (!title || addingSub) return;
    setAddingSub(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_subtask", title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Could not add sub-task");
      setNewSub("");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setAddingSub(false);
  }

  /* ──────────────────────────── activity + comments ─────────────────────── */

  const [pending, setPending] = useState<DetailComment[]>([]);
  useEffect(() => setPending([]), [comments]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  async function postComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    const temp: DetailComment = {
      id: `pending-${Date.now()}`,
      body,
      createdAt: new Date().toISOString(),
      authorId: currentUserId,
      author: currentUserName,
    };
    setPending((p) => [...p, temp]);
    setDraft("");
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? "Could not post comment");
      router.refresh();
    } catch (e) {
      setPending((p) => p.filter((c) => c.id !== temp.id));
      setDraft(body);
      toast((e as Error).message, "error");
    }
    setPosting(false);
  }

  const timeline = useMemo(() => {
    type Item =
      | { kind: "event"; id: string; at: string; actor: string | null; actorId: string | null; text: string }
      | { kind: "comment"; id: string; at: string; c: DetailComment; pending: boolean };
    const items: Item[] = [
      ...activity.map((a): Item => ({
        kind: "event",
        id: `a-${a.id}`,
        at: a.at,
        actor: a.actor,
        actorId: a.actorId,
        text: describeActivity(a.type, a.payload),
      })),
      ...comments.map((c): Item => ({ kind: "comment", id: c.id, at: c.createdAt, c, pending: false })),
      ...pending.map((c): Item => ({ kind: "comment", id: c.id, at: c.createdAt, c, pending: true })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [activity, comments, pending]);

  /* ───────────────────────────────── render ─────────────────────────────── */

  const due = dueInfo(task);
  const primary = task.assignee ?? task.assignees[0]?.name ?? null;
  const doneSubs = subs.filter((s) => s.done).length;
  const totalWorked = task.work.reduce((a, w) => a + w.elapsedMs, 0);
  const others = task.assignees.filter((a) => a.id !== task.assigneeId);
  const btn =
    "inline-flex min-h-[32px] items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal disabled:cursor-default disabled:hover:bg-transparent";
  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px] text-muted">
          <Link href="/tasks" className="shrink-0 rounded px-1 hover:text-ink">Tasks</Link>
          {task.projectId && task.projectName && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <Link href={`/projects/${task.projectId}`} className="max-w-[140px] truncate rounded px-1 hover:text-ink">
                {task.projectName}
              </Link>
            </>
          )}
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0 font-mono text-ink">{task.code}</span>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <TrackRecent type="task" id={task.id} label={`${task.code} ${task.title}`} path={`/tasks/${task.code}`} />
          <StarButton label={`${task.code} ${task.title}`} path={`/tasks/${task.code}`} className="h-8 w-8" />
          {idx >= 0 && (
            <>
              <span className="mr-1 font-mono text-[12px] text-muted" aria-live="polite">
                {idx + 1} / {order.length}
              </span>
              <button type="button" className={iconBtn} disabled={!prevCode} onClick={() => prevCode && router.push(`/tasks/${prevCode}`)} aria-label="Previous task (K)" title="Previous task (K)">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" className={iconBtn} disabled={!nextCode} onClick={() => nextCode && router.push(`/tasks/${nextCode}`)} aria-label="Next task (J)" title="Next task (J)">
                <ChevronDown className="h-4 w-4" />
              </button>
            </>
          )}
          <button type="button" className={iconBtn} onClick={copyLink} aria-label="Copy link" title="Copy link">
            <LinkIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
        <div
          className={cn(
            "mx-auto grid w-full max-w-[1080px] gap-x-12 gap-y-6 px-4 py-6 sm:px-8 sm:py-10",
            "lg:grid-cols-[minmax(0,1fr)_260px] lg:grid-rows-[auto_1fr]"
          )}
        >
          {/* Title */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <TitleField
              value={task.title}
              canEdit={canEdit}
              onSave={(t) => void mutate(task.id, { title: t }, () => saveTitle(task.id, t)).then(afterOk)}
            />
          </div>

          {/* Property column */}
          <aside className="min-w-0 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start" aria-label="Task properties">
            <SectionLabel className="mb-1 px-1.5">Properties</SectionLabel>
            <dl className="space-y-0.5">
              <Prop label="Status">
                <StatusPicker value={task.status} onChange={pickStatus} open={pk === "status"} onOpenChange={(o) => setPk(o ? "status" : null)}>
                  <button type="button" className={btn}>
                    <StatusIcon status={task.status} />
                    <span>{STATUS_META[task.status].label}</span>
                  </button>
                </StatusPicker>
              </Prop>
              <Prop label="Priority">
                <PriorityPicker value={task.priority} onChange={pickPriority} disabled={!canEdit} open={pk === "priority"} onOpenChange={(o) => setPk(o ? "priority" : null)}>
                  <button type="button" disabled={!canEdit} className={btn}>
                    <PriorityIcon priority={task.priority} />
                    <span>{PRIORITY_META[task.priority].label}</span>
                  </button>
                </PriorityPicker>
              </Prop>
              <Prop label="Assignee">
                <AssigneePicker
                  value={task.assigneeId}
                  employees={employees}
                  currentUserId={currentUserId}
                  canAssign={canAssign}
                  offerTake={canAssignToMe(task, currentUserId, canAssign)}
                  onChange={pickAssignee}
                  disabled={!canEdit}
                  open={pk === "assignee"}
                  onOpenChange={(o) => setPk(o ? "assignee" : null)}
                >
                  <button type="button" disabled={!canEdit} className={btn}>
                    <AssigneeAvatar name={primary} size={18} />
                    <span className="truncate">{primary ?? "Unassigned"}</span>
                  </button>
                </AssigneePicker>
                <AssignToMeButton
                  task={task}
                  currentUserId={currentUserId}
                  canAssign={canAssign}
                  onTake={() => pickAssignee({ id: currentUserId, name: employees.find((x) => x.id === currentUserId)?.name ?? "Me" })}
                  className="-ml-1.5 mt-0.5"
                />
              </Prop>
              {others.length > 0 && (
                <Prop label="Also on it">
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5 py-1 text-[13px]">
                    {others.map((a) => (
                      <Link key={a.id} href={`/team/${a.id}`} className="text-ink hover:underline">{a.name}</Link>
                    ))}
                  </span>
                </Prop>
              )}
              <Prop label="Due">
                <DuePicker value={task.dueDate} onChange={pickDue} disabled={!canEdit} open={pk === "due"} onOpenChange={(o) => setPk(o ? "due" : null)}>
                  <button type="button" disabled={!canEdit} className={cn(btn, "font-mono")} style={{ color: due ? DUE_TONE_COLOR[due.tone] : "var(--muted)" }}>
                    {due ? due.text : "No due date"}
                  </button>
                </DuePicker>
              </Prop>
              <Prop label="Project">
                {task.projectId && task.projectName ? (
                  <PropLink href={`/projects/${task.projectId}`}>{task.projectName}</PropLink>
                ) : (
                  <PropText>None</PropText>
                )}
              </Prop>
              <Prop label="Client">
                {task.clientId && task.clientName ? (
                  <PropLink href={`/clients/${task.clientId}`}>{task.clientName}</PropLink>
                ) : (
                  <PropText>Internal</PropText>
                )}
              </Prop>
              <Prop label="Department">
                {task.department ? (
                  <PropLink href={`/tasks?dept=${encodeURIComponent(task.department)}`}>{task.department}</PropLink>
                ) : (
                  <PropText>None</PropText>
                )}
              </Prop>
              <Prop label="Created by">
                {task.creatorId && task.creatorName ? (
                  <PropLink href={`/team/${task.creatorId}`}>{task.creatorName}</PropLink>
                ) : (
                  <PropText>{task.creatorName ?? "Unknown"}</PropText>
                )}
              </Prop>
              {task.estimateHrs != null && <Prop label="Estimate"><PropText>{task.estimateHrs}h{task.actualHrs != null ? ` · ${task.actualHrs}h actual` : ""}</PropText></Prop>}
              {totalWorked > 0 && <Prop label="Worked"><PropText mono>{formatElapsed(totalWorked)}</PropText></Prop>}
            </dl>

            {task.blocked && (
              <div className="mt-4 rounded-lg border border-crimson/40 bg-crimson/10 p-3">
                <div className="flex items-center gap-2 text-[13px] font-medium text-crimson">
                  <Ban className="h-4 w-4" /> Blocked
                </div>
                {task.blockerReason && <p className="mt-1 text-[12.5px] leading-relaxed text-ink">{task.blockerReason}</p>}
              </div>
            )}

            {/* Work actions — same rules as the drawer */}
            <div className="mt-4 flex flex-wrap gap-2">
              {task.status === "IN_PROGRESS" && (
                <ActionBtn onClick={() => setCompleteOpen(true)} tone={isLeaderOrCreator ? "emerald" : "amber"} icon={<Check className="h-4 w-4" />}>
                  {isLeaderOrCreator ? "Complete" : "Submit for approval"}
                </ActionBtn>
              )}
              {task.status === "IN_REVIEW" && isLeaderOrCreator && (
                <>
                  <ActionBtn onClick={() => setCompleteOpen(true)} tone="emerald" icon={<Check className="h-4 w-4" />}>Approve and complete</ActionBtn>
                  <ActionBtn onClick={() => pickStatus("IN_PROGRESS", "Changes requested by approver")} tone="crimson" icon={<RotateCcw className="h-4 w-4" />}>Request changes</ActionBtn>
                </>
              )}
              {task.status === "IN_REVIEW" && !isLeaderOrCreator && (
                <span className="rounded-md border border-amber/25 bg-amber/10 px-2.5 py-1.5 text-[12px] text-amber">Waiting for approval from the creator</span>
              )}
              {task.status === "DONE" && (
                <ActionBtn onClick={() => pickStatus("IN_PROGRESS")} tone="amber" icon={<RotateCcw className="h-4 w-4" />}>Reopen</ActionBtn>
              )}
            </div>
          </aside>

          {/* Body */}
          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
            {/* Description */}
            <section aria-label="Description">
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    rows={6}
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveDesc();
                      if (e.key === "Escape") setEditingDesc(false);
                    }}
                    placeholder="What needs to happen, and what does done look like?"
                    className="w-full resize-y rounded-lg border border-edge bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingDesc(false)} className="rounded-md px-3 py-1.5 text-[12px] text-muted hover:bg-hover hover:text-ink">Cancel</button>
                    <button type="button" onClick={saveDesc} className="rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:bg-tealhi">Save</button>
                  </div>
                </div>
              ) : task.description ? (
                <div
                  onClick={startDesc}
                  className={cn("text-[14.5px] leading-relaxed text-ink2", canEdit && "cursor-text rounded-lg hover:bg-hover/40")}
                >
                  <MarkdownText text={task.description} />
                  {task.descriptionByName && <p className="mt-2 text-[11.5px] text-muted">Written by {task.descriptionByName}</p>}
                </div>
              ) : canEdit ? (
                <button type="button" onClick={startDesc} className="text-[14px] text-faint hover:text-muted">Add a description…</button>
              ) : (
                <p className="text-[14px] text-faint">No description.</p>
              )}
              {task.outcome && (
                <div className="mt-4 rounded-lg border border-edge bg-surface px-3.5 py-3">
                  <div className="text-[11.5px] font-medium text-muted">What done looks like</div>
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink2">{task.outcome}</p>
                </div>
              )}
            </section>

            {/* Sub-tasks */}
            <section aria-label="Sub-tasks">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[13px] font-medium text-ink">Sub-tasks</h2>
                {subs.length > 0 && <span className="font-mono text-[12px] text-muted">{doneSubs}/{subs.length}</span>}
              </div>
              <ul className="divide-y divide-line rounded-lg border border-edge">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-start gap-2.5 px-3 py-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={s.done}
                      aria-label={`Mark "${s.title}" ${s.done ? "not done" : "done"}`}
                      onClick={() => toggleSub(s.id, !s.done)}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center md:h-4 md:w-4"
                    >
                      <StatusIcon status={s.done ? "DONE" : s.status === "IN_REVIEW" ? "IN_REVIEW" : "TODO"} size={16} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[13.5px]", s.done ? "text-muted line-through" : "text-ink")}>{s.title}</div>
                      {s.description && <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.description}</div>}
                    </div>
                  </li>
                ))}
                <li className="flex items-center gap-2 px-3 py-1.5">
                  <Plus className="h-4 w-4 shrink-0 text-faint" />
                  <input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addSub(); } }}
                    placeholder="Add a sub-task…"
                    className="min-h-[32px] flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-faint focus:outline-none"
                  />
                </li>
              </ul>
            </section>

            {/* Deliverables */}
            <section aria-label="Deliverables" className="rounded-lg border border-edge p-4">
              <TaskReports taskId={task.id} currentUserId={currentUserId} currentUserRole={currentUserRole} open />
            </section>

            {/* Activity */}
            <section aria-label="Activity">
              <h2 className="mb-3 text-[13px] font-medium text-ink">Activity</h2>
              <ol className="relative space-y-3">
                {timeline.length === 0 && <li className="text-[12.5px] text-faint">No activity yet.</li>}
                {timeline.map((it) =>
                  it.kind === "event" ? (
                    <li key={it.id} className="flex items-baseline gap-3 text-[12.5px] text-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-edge" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        {it.actorId && it.actor ? (
                          <Link href={`/team/${it.actorId}`} className="font-medium text-ink2 hover:underline">{it.actor}</Link>
                        ) : (
                          <span className="font-medium text-ink2">{it.actor ?? "Someone"}</span>
                        )}{" "}
                        {it.text}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-faint" suppressHydrationWarning>{timeAgo(it.at)}</span>
                    </li>
                  ) : (
                    <li key={it.id} className={cn("rounded-lg border border-edge bg-surface p-3", it.pending && "opacity-60")}>
                      <div className="flex items-center gap-2">
                        <Avatar name={it.c.author} size={20} />
                        {it.c.authorId ? (
                          <Link href={`/team/${it.c.authorId}`} className="text-[13px] font-medium text-ink hover:underline">{it.c.author}</Link>
                        ) : (
                          <span className="text-[13px] font-medium text-ink">{it.c.author}</span>
                        )}
                        <span className="text-[11.5px] text-faint" suppressHydrationWarning>{it.pending ? "sending…" : timeAgo(it.at)}</span>
                      </div>
                      <div className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
                        <MarkdownText text={it.c.body} />
                      </div>
                    </li>
                  )
                )}
              </ol>

              <div className="mt-4 rounded-lg border border-edge bg-surface focus-within:border-teal">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void postComment(); }}
                  rows={3}
                  placeholder="Leave a comment…"
                  className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none"
                />
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <span className="hidden text-[11.5px] text-faint sm:block">Ctrl or Cmd + Enter to post</span>
                  <button
                    type="button"
                    onClick={() => void postComment()}
                    disabled={!draft.trim() || posting}
                    className="ml-auto rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-40"
                  >
                    Comment
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {completeOpen && (
        <CompleteTaskModal
          taskId={task.id}
          taskCode={task.code}
          isLeaderOrCreator={isLeaderOrCreator}
          open={completeOpen}
          onClose={() => setCompleteOpen(false)}
          onCompleted={() => {
            setCompleteOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────── helpers ───────────────────────────────── */

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-center gap-2 text-[13px]">
      <dt className="w-[88px] shrink-0 px-1.5 text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function PropLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block truncate rounded-md px-1.5 py-1 text-[13px] text-ink hover:bg-hover hover:underline">
      {children}
    </Link>
  );
}

function PropText({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={cn("block truncate px-1.5 py-1 text-[13px] text-muted", mono && "font-mono")}>{children}</span>;
}

function ActionBtn({
  onClick,
  tone,
  icon,
  disabled,
  children,
}: {
  onClick: () => void;
  tone: "tealhi" | "amber" | "emerald" | "crimson";
  icon: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const c = `var(--${tone})`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition hover:opacity-85 disabled:opacity-50"
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 28%, transparent)`,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Big auto-growing title; saves on blur / Enter, Escape reverts. */
function TitleField({ value, canEdit, onSave }: { value: string; canEdit: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(value), [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={v}
      readOnly={!canEdit}
      aria-label="Task title"
      onChange={(e) => setV(e.target.value.replace(/\n/g, " "))}
      onBlur={() => {
        const t = v.trim();
        if (t && t !== value) onSave(t);
        else setV(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setV(value); e.currentTarget.blur(); }
      }}
      className="block w-full resize-none overflow-hidden rounded-md bg-transparent text-[24px] font-semibold leading-tight tracking-tight text-ink outline-none focus-visible:bg-hover/30 sm:text-[28px]"
    />
  );
}
