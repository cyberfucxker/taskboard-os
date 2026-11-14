"use client";

/**
 * TasksList — the Linear-style list view of tasks (Board | List toggle in the
 * Tasks header). Airy ~40px rows grouped by status with collapsible group
 * headers and counts. Each row: priority bars, short ID (links to the full
 * task page), status circle, title, subtask count, client, due date, assignee.
 *
 * Inline editing: click the priority / status / due / assignee of any row (or
 * focus a row and press P / S / D / A) to open a popover. The change shows at
 * once and rolls back with a toast if the server refuses it
 * (useOptimisticTasks, which calls the same routes the drawer and bulk bar use).
 *
 * Keyboard (when no input is focused): J/K or arrows move, X selects, Enter
 * opens the drawer, S/P/A/D change the focused row, Esc clears. Selection
 * checkboxes + a sticky bulk bar still batch status/reassign (POST
 * /api/tasks/bulk). Nothing essential is hover-only, so it works on a phone.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, ChevronDown, ListChecks } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import type { TaskView } from "@/components/tasks/types";
import {
  AssigneeAvatar,
  DUE_TONE_COLOR,
  PRIORITY_META,
  PickerHost,
  PriorityIcon,
  STATUS_GROUP_ORDER,
  STATUS_MENU_ORDER,
  STATUS_META,
  StatusIcon,
  TASK_ORDER_KEY,
  dueInfo,
  dueLabelFor,
  saveAssignee,
  saveDue,
  savePriority,
  saveStatus,
  useOptimisticTasks,
  type PickerKind,
  type PickerState,
  type Priority,
  type Status,
} from "@/components/tasks/pickers";

const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const COLLAPSE_KEY = "taskboard.tasksList.collapsed";

function dueRank(t: TaskView): number {
  return t.dueDate ? Date.parse(t.dueDate) : Number.MAX_SAFE_INTEGER;
}

function isEditable(el: HTMLElement | null): boolean {
  return Boolean(el?.closest("input, select, textarea, [contenteditable='true'], [contenteditable='']"));
}

export function TasksList({
  tasks,
  onOpenTask,
  onBulkChanged,
  employees = [],
  canAssign = false,
  onClearFilter,
  onActiveChange,
}: {
  tasks: TaskView[];
  onOpenTask: (id: string) => void;
  /** Called after a successful change so the parent can router.refresh(). */
  onBulkChanged?: () => void;
  employees?: { id: string; name: string }[];
  canAssign?: boolean;
  /** When a text filter is active, shows "Clear filter" in the empty state. */
  onClearFilter?: () => void;
  /** Called when J/K moves the focused row (peek pane follows it). */
  onActiveChange?: (id: string) => void;
}) {
  const toast = useToast();
  const { data: sessionData } = useSession();
  const me = (sessionData?.user as { id?: string } | undefined)?.id;

  const { tasks: view, mutate } = useOptimisticTasks(tasks);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["DONE"]));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null); // last toggled id for shift-range select

  // Bulk selection + action bar state.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [blockReason, setBlockReason] = useState("");

  // Remembered group collapse (per browser).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* storage unavailable: keep the default */ }
  }, []);
  function toggleGroup(st: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st);
      else next.add(st);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  const visible = useMemo(() => {
    if (statusFilter === "all") return view;
    const set = new Set(statusFilter.split(",").filter(Boolean));
    return view.filter((t) => set.has(t.status));
  }, [view, statusFilter]);

  const groups = useMemo(() => {
    const by = new Map<string, TaskView[]>();
    for (const t of visible) {
      const arr = by.get(t.status) ?? [];
      arr.push(t);
      by.set(t.status, arr);
    }
    return STATUS_GROUP_ORDER.filter((s) => by.has(s)).map((s) => ({
      status: s,
      rows: (by.get(s) ?? []).sort(
        (a, b) =>
          (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9) ||
          dueRank(a) - dueRank(b) ||
          a.code.localeCompare(b.code)
      ),
    }));
  }, [visible]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of view) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [view]);

  // Ids in on-screen order (collapsed groups contribute nothing): the order
  // J/K walk and shift-select ranges over.
  const flatIds = useMemo(
    () => groups.filter((g) => !collapsed.has(g.status)).flatMap((g) => g.rows.map((t) => t.id)),
    [groups, collapsed]
  );
  const byId = useMemo(() => new Map(view.map((t) => [t.id, t])), [view]);

  // Hand the list order to the task detail page's "n / total" stepper.
  const orderCodes = useMemo(() => groups.flatMap((g) => g.rows.map((t) => t.code)), [groups]);
  useEffect(() => {
    try { sessionStorage.setItem(TASK_ORDER_KEY, JSON.stringify(orderCodes)); } catch { /* ignore */ }
  }, [orderCodes]);

  useEffect(() => {
    if (activeId && !byId.has(activeId)) setActiveId(null);
    if (activeId) containerRef.current?.querySelector(`[data-row-id="${activeId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeId, byId]);

  const canEditTask = useCallback(
    (t: TaskView) => canAssign || (!!me && (t.creatorId === me || t.assignees.some((a) => a.id === me))),
    [canAssign, me]
  );

  /* ───────────────────────────── inline mutations ───────────────────────── */

  function afterOk(ok: boolean) {
    if (ok) onBulkChanged?.();
  }

  const changeStatus = (t: TaskView, status: Status, reason?: string) => {
    // Server rule: only the creator or a lead may close a task; anyone else
    // sends it to review instead. Predict that so the row does not flicker.
    const toReview = status === "DONE" && !(canAssign || (!!me && t.creatorId === me));
    const effective: Status = toReview ? "IN_REVIEW" : status;
    void mutate(
      t.id,
      { status: effective, blocked: effective === "BLOCKED", blockerReason: effective === "BLOCKED" ? reason ?? null : null },
      () => saveStatus(t.id, status, reason),
      toReview ? "Sent for review: a lead will approve it" : undefined
    ).then(afterOk);
  };

  const changePriority = (t: TaskView, p: Priority) => {
    void mutate(t.id, { priority: p }, () => savePriority(t.id, p)).then(afterOk);
  };

  const changeDue = (t: TaskView, iso: string | null) => {
    void mutate(
      t.id,
      { dueDate: iso ? `${iso}T00:00:00.000Z` : null, dueLabel: dueLabelFor(iso) },
      () => saveDue(t.id, iso)
    ).then(afterOk);
  };

  const changeAssignee = (t: TaskView, e: { id: string; name: string }) => {
    void mutate(
      t.id,
      { assigneeId: e.id, assignee: e.name, assignees: [{ id: e.id, name: e.name }, ...t.assignees.filter((a) => a.id !== e.id)] },
      () => saveAssignee(t.id, e.id),
      e.id === me ? "Assigned to you" : undefined
    ).then(afterOk);
  };

  /* ──────────────────────────────── pickers ─────────────────────────────── */

  const openPicker = useCallback(
    (kind: PickerKind, taskId: string, anchor: HTMLElement) => {
      const t = byId.get(taskId);
      if (!t) return;
      if (kind !== "status" && !canEditTask(t)) {
        toast("You can only edit tasks you created or are assigned to.", "error");
        return;
      }
      setActiveId(taskId);
      setPicker({ kind, taskId, anchor });
    },
    [byId, canEditTask, toast]
  );

  function closePicker() {
    setPicker(null);
    // Keep the keyboard flow: focus returns to the list, not to a row control.
    requestAnimationFrame(() => containerRef.current?.focus({ preventScroll: true }));
  }

  /* ────────────────────────────── selection ─────────────────────────────── */

  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && anchorRef.current && flatIds.includes(anchorRef.current)) {
          const a = flatIds.indexOf(anchorRef.current);
          const b = flatIds.indexOf(id);
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          flatIds.slice(lo, hi + 1).forEach((x) => next.add(x));
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          anchorRef.current = id;
        }
        return next;
      });
    },
    [flatIds]
  );

  function clearSelection() {
    setSelected(new Set());
    setBulkStatus("");
    setBulkAssignee("");
    setBlockReason("");
  }

  const openRow = useCallback(
    (id: string) => {
      setActiveId(id);
      onOpenTask(id);
    },
    [onOpenTask]
  );

  /* ───────────────────────────── keyboard model ─────────────────────────── */

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement;
    // Ignore keys while a picker is open or the task drawer is showing on top (it has its own S/P/A/D).
    if (isEditable(el) || el.closest("[data-picker-content]") || picker || document.querySelector("[data-task-drawer]")) return;
    const k = e.key;
    const onControl = el !== e.currentTarget && Boolean(el.closest("button, a"));

    const move = (delta: 1 | -1) => {
      if (flatIds.length === 0) return;
      const i = activeId ? flatIds.indexOf(activeId) : -1;
      const next = i === -1 ? (delta > 0 ? 0 : flatIds.length - 1) : Math.min(flatIds.length - 1, Math.max(0, i + delta));
      setActiveId(flatIds[next]);
      onActiveChange?.(flatIds[next]);
    };

    if (k === "j" || k === "J" || k === "ArrowDown") { e.preventDefault(); move(1); }
    else if (k === "k" || k === "K" || k === "ArrowUp") { e.preventDefault(); move(-1); }
    else if ((k === "x" || k === "X") && activeId) { e.preventDefault(); toggleSelect(activeId, false); }
    else if (k === "Enter" && activeId && !onControl) { e.preventDefault(); onOpenTask(activeId); }
    else if (k === "Escape") { clearSelection(); setActiveId(null); }
    else if (activeId && "spadSPAD".includes(k) && k.length === 1) {
      e.preventDefault();
      const kind = ({ s: "status", p: "priority", a: "assignee", d: "due" } as Record<string, PickerKind>)[k.toLowerCase()];
      const anchor = containerRef.current?.querySelector<HTMLElement>(`[data-row-id="${activeId}"] [data-picker="${kind}"]`);
      if (anchor) openPicker(kind, activeId, anchor);
    }
  }

  /* ───────────────────────────────── bulk bar ───────────────────────────── */

  async function applyBulk() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!bulkStatus && !bulkAssignee) { toast("Pick a status or an assignee to apply.", "error"); return; }
    if (bulkStatus && bulkAssignee) { toast("Choose one action at a time.", "error"); return; }

    setBulkBusy(true);
    try {
      const body = bulkStatus
        ? { ids, action: "status", value: bulkStatus, reason: bulkStatus === "BLOCKED" ? blockReason.trim() || null : null }
        : { ids, action: "reassign", value: bulkAssignee };
      const res = await fetch("/api/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        const n = data.changed as number;
        toast(
          bulkStatus
            ? `Moved ${n} task${n === 1 ? "" : "s"} to ${STATUS_META[bulkStatus as Status]?.label ?? bulkStatus}`
            : `Reassigned ${n} task${n === 1 ? "" : "s"} to ${employees.find((e) => e.id === bulkAssignee)?.name ?? "assignee"}`,
          "success"
        );
        clearSelection();
        onBulkChanged?.();
      } else {
        toast(data.error ?? "Bulk update failed", "error");
      }
    } catch {
      toast("Bulk update failed", "error");
    }
    setBulkBusy(false);
  }

  function toggleStatusFilter(st: string) {
    setStatusFilter((prev) => {
      const set = new Set(prev === "all" ? [] : prev.split(",").filter(Boolean));
      if (set.has(st)) set.delete(st);
      else set.add(st);
      return set.size === 0 ? "all" : [...set].join(",");
    });
  }

  const pickerTask = picker ? byId.get(picker.taskId) ?? null : null;
  const selectMode = selected.size > 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Tasks list"
      onKeyDown={onKeyDown}
      className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
    >
      {/* Status filter pills */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All <span className="font-mono text-muted">{view.length}</span>
        </FilterPill>
        {STATUS_MENU_ORDER.map((st) => {
          const on = statusFilter !== "all" && statusFilter.split(",").includes(st);
          return (
            <FilterPill key={st} active={on} onClick={() => toggleStatusFilter(st)}>
              <StatusIcon status={st} size={12} />
              {STATUS_META[st].label} <span className="font-mono text-muted">{statusCounts[st] ?? 0}</span>
            </FilterPill>
          );
        })}
      </div>

      {/* Grouped rows */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="list">
        {groups.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-16 text-center">
            <div className="text-[13px] font-medium text-ink">No tasks match this view</div>
            <div className="text-[12px] text-muted">Clear a filter, or press N to create a task.</div>
            {onClearFilter && (
              <button type="button" onClick={onClearFilter} className="mt-2 h-8 rounded-md border border-edge px-3 text-[13px] font-medium text-ink2 transition-colors hover:bg-hover">
                No matches — Clear filter
              </button>
            )}
          </div>
        )}
        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.status);
          return (
            <section key={g.status} aria-label={STATUS_META[g.status].label}>
              <div className="sticky top-0 z-[1] flex h-9 items-center border-b border-line bg-raised px-2 sm:px-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.status)}
                  aria-expanded={!isCollapsed}
                  className="flex min-h-[36px] flex-1 items-center gap-2 rounded text-left text-[12.5px] font-medium text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", isCollapsed && "-rotate-90")} />
                  <StatusIcon status={g.status} />
                  <span>{STATUS_META[g.status].label}</span>
                  <span className="font-mono text-[11.5px] text-muted">{g.rows.length}</span>
                </button>
              </div>
              {!isCollapsed &&
                g.rows.map((t) => (
                  <TaskRow
                    key={t.id}
                    t={t}
                    active={activeId === t.id}
                    selected={selected.has(t.id)}
                    selectMode={selectMode}
                    canEdit={canEditTask(t)}
                    onOpen={openRow}
                    onSelect={toggleSelect}
                    onPicker={openPicker}
                  />
                ))}
            </section>
          );
        })}
      </div>

      <PickerHost
        picker={picker}
        task={pickerTask}
        employees={employees}
        currentUserId={me}
        canAssign={canAssign}
        onClose={closePicker}
        onStatus={changeStatus}
        onPriority={changePriority}
        onAssignee={changeAssignee}
        onDue={changeDue}
      />

      {selected.size > 0 && (
        <div className="shrink-0 border-t border-line bg-raised px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-ink">{selected.size} selected</span>
            <select
              value={bulkStatus}
              onChange={(e) => { setBulkStatus(e.target.value); if (e.target.value !== "BLOCKED") setBlockReason(""); }}
              className="rounded-md border border-edge bg-bg px-2 py-1.5 text-[12px] text-ink focus:border-teal focus:outline-none"
              aria-label="Move selected to status"
            >
              <option value="">Move to…</option>
              {STATUS_MENU_ORDER.map((st) => (
                <option key={st} value={st}>{STATUS_META[st].label}</option>
              ))}
            </select>
            {bulkStatus === "BLOCKED" && (
              <input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Blocker description (required)…"
                className="min-w-[180px] rounded-md border border-crimson/40 bg-bg px-2 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
              />
            )}
            {canAssign && (
              <select
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
                className="rounded-md border border-edge bg-bg px-2 py-1.5 text-[12px] text-ink focus:border-teal focus:outline-none"
                aria-label="Reassign selected to"
              >
                <option value="">Reassign to…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={clearSelection} className="rounded-md border border-edge px-3 py-1.5 text-[12px] text-muted hover:bg-hover hover:text-ink">
                Clear
              </button>
              <button
                onClick={applyBulk}
                disabled={bulkBusy}
                className="rounded-md bg-teal px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-50"
              >
                {bulkBusy ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────── row ─────────────────────────────────── */

const TaskRow = memo(function TaskRow({
  t,
  active,
  selected,
  selectMode,
  canEdit,
  onOpen,
  onSelect,
  onPicker,
}: {
  t: TaskView;
  active: boolean;
  selected: boolean;
  selectMode: boolean;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onSelect: (id: string, shift: boolean) => void;
  onPicker: (kind: PickerKind, taskId: string, anchor: HTMLElement) => void;
}) {
  const due = dueInfo(t);
  const done = t.status === "DONE";
  const doneSubs = t.subtasks.filter((s) => s.done).length;
  const assigneeName = t.assignee ?? t.assignees[0]?.name ?? null;

  // Small ghost button that opens a picker. stopPropagation keeps the row's
  // own click (open the drawer) from firing.
  const trigger = (kind: PickerKind, label: string, extra?: string) => ({
    type: "button" as const,
    "data-picker": kind,
    "aria-label": label,
    title: label,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onPicker(kind, t.id, e.currentTarget);
    },
    className: cn(
      "flex h-11 shrink-0 items-center justify-center rounded-md text-left transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal md:h-7",
      extra
    ),
  });

  return (
    <div
      role="listitem"
      data-row-id={t.id}
      aria-selected={selected}
      onClick={() => onOpen(t.id)}
      className={cn(
        "group flex min-h-[44px] cursor-pointer items-center gap-1 border-b border-line px-2 text-[13px] transition-colors sm:px-3 md:min-h-[40px]",
        "hover:bg-hover/60",
        active && "bg-hover/70 shadow-[inset_2px_0_0_0_var(--teal)]",
        selected && "bg-teal/10"
      )}
    >
      {/* Select (always visible on touch / once a selection exists; on desktop it appears on hover) */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${t.code}`}
        onClick={(e) => { e.stopPropagation(); onSelect(t.id, e.shiftKey); }}
        className={cn(
          "flex h-11 w-7 shrink-0 items-center justify-center md:h-7",
          selectMode || selected ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border",
            selected ? "border-teal bg-teal text-bg" : "border-edge text-transparent"
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      </button>

      <button {...trigger("priority", `Priority: ${PRIORITY_META[t.priority].label}`, "w-7")}>
        <PriorityIcon priority={t.priority} />
      </button>

      <Link
        href={`/tasks/${t.code}`}
        onClick={(e) => e.stopPropagation()}
        className="hidden w-[68px] shrink-0 truncate font-mono text-[11.5px] text-muted hover:text-ink hover:underline sm:block"
        title={`Open ${t.code} as a full page`}
      >
        {t.code}
      </Link>

      <button {...trigger("status", `Status: ${STATUS_META[t.status].label}`, "w-7")}>
        <StatusIcon status={t.status} />
      </button>

      <span className={cn("min-w-0 flex-1 truncate px-1 font-medium", done ? "text-muted" : "text-ink")}>{t.title}</span>

      {t.subtasks.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted sm:flex" title="Subtasks done">
          <ListChecks className="h-3 w-3" />
          {doneSubs}/{t.subtasks.length}
        </span>
      )}


      {t.department && (
        <span
          className="hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:flex"
          style={{ borderColor: t.departmentColor ?? 'var(--edge)', color: t.departmentColor ?? 'var(--muted)', background: t.departmentColor ? t.departmentColor + '18' : 'transparent' }}
          title={t.department}
        >
          {t.department}
        </span>
      )}

      {t.clientId && t.clientName && (
        <Link
          href={`/clients/${t.clientId}`}
          onClick={(e) => e.stopPropagation()}
          className="hidden max-w-[130px] shrink-0 truncate px-1 text-[12px] text-muted hover:text-ink hover:underline lg:block"
        >
          {t.clientName}
        </Link>
      )}

      <button {...trigger("due", due ? `Due ${due.text}` : "Set due date", cn("min-w-[40px] px-1.5 font-mono text-[11.5px]", !due && "text-faint md:opacity-0 md:group-hover:opacity-100"))}
        style={due ? { color: DUE_TONE_COLOR[due.tone] } : undefined}
      >
        {due ? due.text : "—"}
      </button>

      <button {...trigger("assignee", assigneeName ? `Assignee: ${assigneeName}` : "Assign", "w-7")}>
        <AssigneeAvatar name={assigneeName} size={20} muted={done} />
      </button>
    </div>
  );
});

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition",
        active ? "border-teal bg-teal/15 text-ink" : "border-edge text-muted hover:border-[var(--border-default)] hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
