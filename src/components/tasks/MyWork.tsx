"use client";

import { useMemo, useState } from "react";
import { createTask as openCreateTaskDrawer } from "@/lib/task-drawer";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowRight,
  Filter,
  Search,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import type { TaskView } from "@/components/tasks/types";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { ListToolbar, NoMatches, StickyList, useListFilter, useWideScreen } from "@/components/list";

const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const ms = new Date(dateStr).getTime();
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function MyWork({
  tasks,
  doneTasks,
}: {
  tasks: TaskView[];
  doneTasks: TaskView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const wide = useWideScreen();
  const taskFilter = useListFilter(tasks, (t) => [t.title, t.code, t.clientName].filter(Boolean).join(" "));
  const [clientFilter, setClientFilter] = useState("ALL");

  // In-page Drawer & Completion modal state
  const [selectedTask, setSelectedTask] = useState<TaskView | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completingTaskCode, setCompletingTaskCode] = useState<string | null>(null);
  const [completionFlowOpen, setCompletionFlowOpen] = useState(false);

  // Extract unique clients
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.clientName) set.add(t.clientName);
    });
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(
    () => taskFilter.filtered.filter((t) => clientFilter === "ALL" || t.clientName === clientFilter),
    [taskFilter.filtered, clientFilter]
  );

  const { overdue, dueToday, inProgress, queue } = useMemo(() => {
    const today = localDateStr(new Date());
    const isActive = (t: TaskView) => t.status === "IN_PROGRESS";
    const byPrio = (xs: TaskView[]) =>
      [...xs].sort((a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9));
    return {
      overdue: byPrio(filteredTasks.filter((t) => !isActive(t) && t.dueDate && t.dueDate < today)),
      dueToday: byPrio(filteredTasks.filter((t) => !isActive(t) && t.dueDate === today)),
      inProgress: byPrio(filteredTasks.filter((t) => isActive(t))),
      queue: byPrio(filteredTasks.filter((t) => !isActive(t) && (!t.dueDate || t.dueDate > today))),
    };
  }, [filteredTasks]);

  async function act(id: string, action: string, body: Record<string, unknown> = {}) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(action === "status" && body.status === "DONE" ? "Marked done ✓" : "Updated", "success");
        router.refresh();
      } else {
        toast(data.error ?? "Update failed", "error");
      }
    } catch {
      toast("Update failed", "error");
    }
    setBusyId(null);
  }

  async function openDrawer(codeOrId: string) {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(codeOrId)}?activity=1`);
      const data = await res.json();
      if (data.ok && data.task) {
        setSelectedTask(data.task);
      } else {
        toast(data.error ?? "Task not found", "error");
      }
    } catch {
      toast("Could not open task", "error");
    }
  }

  return (
    <StickyList
      header={
        <div className="flex h-12 items-center gap-3 border-b border-line px-4">
          <h1 className="text-[14px] font-semibold tracking-tight text-ink">My Work Focus</h1>
          <span className="hidden truncate text-[12px] text-muted md:block">
            {filteredTasks.length} assigned task{filteredTasks.length !== 1 ? "s" : ""} across your active projects
          </span>
        </div>
      }
      toolbar={
        <ListToolbar
          filter={taskFilter}
          shown={filteredTasks.length}
          total={tasks.length}
          noun="tasks"
          placeholder="Filter tasks…"
          primary={
            <button
              onClick={() => openCreateTaskDrawer()}
              className="h-8 rounded-md bg-teal px-3 text-[13px] font-medium text-white transition hover:bg-tealhi"
            >
              + New Task
            </button>
          }
        >
          {clientOptions.length > 0 && (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="h-8 rounded-md border border-edge bg-transparent px-2.5 text-[13px] text-ink focus:border-teal focus:outline-none"
            >
              <option value="ALL">All Clients ({clientOptions.length})</option>
              {clientOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </ListToolbar>
      }
      peek={
        wide && selectedTask ? (
          <TaskDrawer
            inline
            task={selectedTask}
            open
            onClose={() => setSelectedTask(null)}
            onStatus={async (id, status, reason) => {
              await act(id, "status", { status, reason });
              openDrawer(id);
            }}
            onSubtask={async (taskId, subtaskId, done) => {
              await fetch(`/api/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "subtask", subtaskId, done }),
              });
              openDrawer(taskId);
            }}
            currentUserId=""
            canAssign={true}
          />
        ) : null
      }
    >
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {filteredTasks.length === 0 && taskFilter.active && <NoMatches filter={taskFilter} />}

      {/* Currently running banner */}
      {inProgress.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-tealhi/50 bg-teal/10 px-4 py-3.5 shadow-sm">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tealhi opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-tealhi" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-tealhi">
              Active Work Session
            </div>
            <button
              onClick={() => openDrawer(inProgress[0].code)}
              className="truncate text-[14px] font-medium text-ink hover:underline flex items-center gap-2"
            >
              <span className="font-mono text-muted">{inProgress[0].code}</span>
              <span>{inProgress[0].title}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCompletingTaskId(inProgress[0].id);
                setCompletingTaskCode(inProgress[0].code);
                setCompletionFlowOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-emerald px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald/90 transition"
            >
              <Check className="h-3.5 w-3.5" /> Done
            </button>

          </div>
        </div>
      )}

      {/* Sections Grid */}
      <div className="space-y-6">
        <Section
          title="Overdue"
          tone="var(--crimson)"
          count={overdue.length}
          tasks={overdue}
          onOpen={openDrawer}
          onAct={act}
          busyId={busyId}
          onComplete={(t) => {
            setCompletingTaskId(t.id);
            setCompletingTaskCode(t.code);
            setCompletionFlowOpen(true);
          }}
        />
        <Section
          title="Due Today"
          tone="var(--amber)"
          count={dueToday.length}
          tasks={dueToday}
          onOpen={openDrawer}
          onAct={act}
          busyId={busyId}
          onComplete={(t) => {
            setCompletingTaskId(t.id);
            setCompletingTaskCode(t.code);
            setCompletionFlowOpen(true);
          }}
        />
        <Section
          title="In Progress"
          tone="var(--teal)"
          count={inProgress.length}
          tasks={inProgress}
          onOpen={openDrawer}
          onAct={act}
          busyId={busyId}
          onComplete={(t) => {
            setCompletingTaskId(t.id);
            setCompletingTaskCode(t.code);
            setCompletionFlowOpen(true);
          }}
        />
        <Section
          title="My Queue / Backlog"
          tone="var(--muted)"
          count={queue.length}
          tasks={queue}
          onOpen={openDrawer}
          onAct={act}
          busyId={busyId}
          onComplete={(t) => {
            setCompletingTaskId(t.id);
            setCompletingTaskCode(t.code);
            setCompletionFlowOpen(true);
          }}
        />
      </div>

      {/* Recently Done */}
      {doneTasks.length > 0 && (
        <div className="mt-8 rounded-xl border border-hover bg-bg p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px] text-ink">Completed Tasks</span>
              <span className="font-mono text-[11px] text-emerald bg-emerald/10 border border-emerald/30 px-2 py-0.5 rounded-full">
                {doneTasks.length} done
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {doneTasks.slice(0, 10).map((t) => (
              <button
                key={t.id}
                onClick={() => openDrawer(t.code)}
                className="flex items-center justify-between gap-3 rounded-lg border border-hover/70 bg-raised/50 px-3.5 py-2.5 text-left transition hover:border-teal/50 hover:bg-raised"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-emerald">{t.code}</span>
                    <span className="truncate text-[13px] text-ink">{t.title}</span>
                  </div>
                  {t.clientName && (
                    <span className="text-[11px] text-muted">{t.clientName}</span>
                  )}
                </div>
                <span className="text-[11px] text-faint shrink-0 font-mono">
                  {timeAgo(t.completedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* In-Page Wide Task Drawer */}
      {selectedTask && !wide && (
        <TaskDrawer
          task={selectedTask}
          open={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          onStatus={async (id, status, reason) => {
            await act(id, "status", { status, reason });
            openDrawer(id);
          }}
          onSubtask={async (taskId, subtaskId, done) => {
            await fetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "subtask", subtaskId, done }),
            });
            openDrawer(taskId);
          }}
          currentUserId=""
          canAssign={true}
        />
      )}

      {/* Completion Modal */}
      {completionFlowOpen && completingTaskId && (
        <CompleteTaskModal
          taskId={completingTaskId}
          taskCode={completingTaskCode ?? ""}
          open={completionFlowOpen}
          onClose={() => setCompletionFlowOpen(false)}
          onCompleted={() => {
            setCompletionFlowOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
    </StickyList>
  );
}

function Section({
  title,
  tone,
  count,
  tasks,
  onOpen,
  onAct,
  busyId,
  onComplete,
}: {
  title: string;
  tone: string;
  count: number;
  tasks: TaskView[];
  onOpen: (code: string) => void;
  onAct: (id: string, action: string, body?: Record<string, unknown>) => void;
  busyId: string | null;
  onComplete: (t: TaskView) => void;
}) {
  return (
    <div className={count === 0 ? "rounded-lg border border-hover/60 bg-bg px-4 py-2.5" : "rounded-xl border border-hover bg-bg p-5"}>
      <div className={count === 0 ? "flex items-center justify-between" : "mb-3 flex items-center justify-between"}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          <span className={count === 0 ? "text-[12px] font-medium text-muted" : "text-[13px] font-semibold text-ink"}>{title}</span>
          <span className="font-mono text-[11px] text-muted bg-raised border border-hover px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {count === 0 && <span className="text-[11px] text-faint">Nothing here</span>}
      </div>
      {count === 0 ? null : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-hover/70 bg-raised/70 p-3 transition hover:border-edge hover:bg-raised"
            >
              <div
                onClick={() => onOpen(t.code)}
                className="min-w-0 flex-1 cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-semibold text-muted">{t.code}</span>
                  <Badge text={t.priority} />
                  {t.status === "IN_REVIEW" && (
                    <span className="text-[11px] text-amber bg-amber/10 border border-amber/30 px-2 py-0.5 rounded-md font-medium">
                      In Review
                    </span>
                  )}
                  {t.clientName && (
                    <span className="text-[11px] text-tealhi bg-tealhi/10 border border-tealhi/30 px-2 py-0.5 rounded-md">
                      {t.clientName}
                    </span>
                  )}
                  {t.dueLabel && (
                    <span
                      className="font-mono text-[11px]"
                      style={{
                        color:
                          t.dueLabel === "Today"
                            ? "var(--crimson)"
                            : t.dueLabel === "Tomorrow"
                            ? "var(--amber)"
                            : "var(--muted)",
                      }}
                    >
                      {t.dueLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-[13px] font-medium text-ink hover:text-tealhi">
                  {t.title}
                </div>
                {t.outcome && (
                  <div className="mt-0.5 truncate text-[12px] text-muted italic">
                    Goal: {t.outcome}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {t.status === "IN_REVIEW" ? (
                  <span className="rounded bg-amber/15 px-2.5 py-1 text-[11px] font-medium text-amber">
                    Awaiting Approval
                  </span>
                ) : (
                  <>
    

                <button
                  onClick={() => onComplete(t)}
                  disabled={busyId === t.id}
                  title="Complete"
                  className="flex items-center gap-1 rounded-md bg-emerald px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald/90 transition disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Done
                </button>
                  </>
                )}
                <button
                  onClick={() => onOpen(t.code)}
                  className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-ink transition"
                  title="Open task drawer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
