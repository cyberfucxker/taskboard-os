"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Play, Pause, CheckCircle2, ChevronRight, Clock, Sparkles } from "lucide-react";
import { Card, Badge, SectionLabel, Stat, EmptyState } from "@/components/ui";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import type { TaskView } from "@/components/tasks/types";
import { useToast } from "@/components/Toast";
import { fmtMsWithSec } from "@/lib/fmt";

type WTask = {
  id: string;
  code: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
  priority: string;
  dueLabel?: string | null;
  dueDate?: string | null;
  estimateHrs?: number | null;
  startedAt?: string | null;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  assignees: Array<{ employee: { id: string; name: string } }>;
};

type Running = {
  id: string;
  taskId: string;
  code: string;
  title: string;
  startedAt: string | null;
} | null;

type TodayUpdate = { id: string; did?: string | null; doing?: string | null; blockedOn?: string | null } | null;

type WProject = { id: string; name: string };

export function EmployeeWorkspace({
  me,
  tasks,
  running,
  todayUpdate,
  velocity,
  projects,
}: {
  me: {
    id: string;
    name: string;
    role: string;
    title?: string | null;
    department?: { id: string; name: string; slug: string; color: string | null } | null;
  };
  tasks: WTask[];
  running: Running;
  todayUpdate: TodayUpdate;
  velocity: { weekDone: number; weekHours: string };
  projects: WProject[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<{ id: string; code: string } | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<TaskView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Live timer tick
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running?.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running?.startedAt]);

  const runningElapsedMs = running?.startedAt
    ? Math.max(0, now - new Date(running.startedAt).getTime())
    : 0;

  // Load task for in-page drawer preview
  useEffect(() => {
    if (drawerTaskId) {
      fetch(`/api/tasks/${drawerTaskId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.task) {
            setDrawerTask(data.task);
            setDrawerOpen(true);
          }
        })
        .catch(() => toast("Could not load task", "error"));
    }
  }, [drawerTaskId, toast]);

  async function act(taskId: string, action: string, extra?: Record<string, unknown>) {
    setBusy(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && !data.ok)) {
        toast(data?.error ?? "Action failed", "error");
      }
    } catch {
      toast("Action failed", "error");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const byStatus = (s: WTask["status"]) => tasks.filter((t) => t.status === s);
  const done = byStatus("DONE").slice(0, 5);

  const deptLabel = me.department?.name ? `${me.department.name} · ` : "";
  const roleLabel = me.title ?? me.role;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <SectionLabel>{deptLabel}Workspace Cockpit</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold text-ink">
            Hey {me.name.split(" ")[0]}, here&apos;s your day
          </h1>
          <p className="text-[13px] text-muted">
            {roleLabel} — Your focused tasks, time tracking, and standup in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/today"
            className="flex items-center gap-1.5 rounded-xl border border-teal/40 bg-teal/10 px-3.5 py-2 text-xs font-semibold text-tealhi hover:bg-teal/20 transition"
          >
            <Sparkles className="h-3.5 w-3.5" /> Open Today Hub →
          </Link>
        </div>
      </div>

      {/* Focus / running timer */}
      <Card className="!bg-raised p-4">
        {running ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/20 animate-pulse">
              <Clock className="h-4 w-4 text-tealhi" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-ink">{running.title}</div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-tealhi">
                <span>{running.code}</span>
                <span>·</span>
                <span>Active: {fmtMsWithSec(runningElapsedMs)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => act(running.taskId, "pause")}
                disabled={busy === running.taskId}
                className="rounded-md bg-hover px-3 py-1.5 text-[13px] text-ink hover:bg-edge"
              >
                <Pause className="mr-1 inline h-3.5 w-3.5 text-amber" /> Pause
              </button>
              <button
                onClick={() => setCompletingTask({ id: running.taskId, code: running.code })}
                disabled={busy === running.taskId}
                className="rounded-md bg-teal px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-tealhi"
              >
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Complete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted">
            <Play className="h-4 w-4" />
            <div>
              No task running. Hit <span className="text-ink">▶ Start</span> on a task below to begin tracking.
            </div>
          </div>
        )}
      </Card>

      {/* Velocity stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="In progress" value={byStatus("IN_PROGRESS").length} />
        <Stat label="To do" value={byStatus("TODO").length} />
        <Stat label="In review" value={byStatus("IN_REVIEW").length} accent="var(--amber)" />
        <Stat label="Blocked" value={byStatus("BLOCKED").length} />
        <Stat label="Done this week" value={velocity.weekDone} accent="var(--emerald)" />
      </div>

      {/* Tasks by status */}
      <div className="grid gap-4 md:grid-cols-4">
        {(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"] as const).map((s) => (
          <Card key={s} className="!bg-raised p-3">
            <SectionLabel>
              {s === "TODO" ? "To do" : s === "IN_PROGRESS" ? "In progress" : s === "IN_REVIEW" ? "In review" : "Blocked"} · {byStatus(s).length}
            </SectionLabel>
            <div className="mt-2 space-y-2">
              {byStatus(s).length === 0 ? (
                <div className="py-4 text-center text-xs text-muted">Nothing here</div>
              ) : (
                byStatus(s).map((t) => (
                  <div
                    key={t.id}
                    className="block rounded-md border border-hover bg-bg p-2.5 transition hover:border-edge"
                  >
                    <div
                      onClick={() => setDrawerTaskId(t.id)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-ink hover:text-tealhi transition">
                            {t.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted">
                            <span>{t.code}</span>
                            {t.project?.name && <span>· {t.project.name}</span>}
                            {t.dueLabel && <span>· {t.dueLabel}</span>}
                          </div>
                        </div>
                        <Badge text={t.priority} />
                      </div>
                    </div>

                    <div className="mt-2 flex gap-1.5">
                      {s === "IN_PROGRESS" ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            act(t.id, "pause");
                          }}
                          disabled={busy === t.id}
                          className="rounded bg-hover px-2 py-1 text-[11px] text-ink hover:bg-edge"
                        >
                          Pause
                        </button>
                      ) : s === "IN_REVIEW" ? (
                        <span className="rounded bg-amber/15 px-2 py-1 text-[11px] font-medium text-amber">
                          Awaiting Approval
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            act(t.id, "start");
                          }}
                          disabled={busy === t.id}
                          className="rounded bg-teal/20 px-2 py-1 text-[11px] font-semibold text-tealhi hover:bg-teal/30"
                        >
                          ▶ Start
                        </button>
                      )}
                      {s !== "IN_REVIEW" && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setCompletingTask({ id: t.id, code: t.code });
                          }}
                          disabled={busy === t.id}
                          className="rounded bg-emerald/15 px-2 py-1 text-[11px] text-emerald hover:bg-emerald/25"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Standup + Recently done */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="!bg-raised p-4">
          <SectionLabel>Today&apos;s standup</SectionLabel>
          {todayUpdate ? (
            <div className="mt-2 text-[13px] text-muted">
              <p className="text-ink">{todayUpdate.doing ?? "No notes for today yet."}</p>
              <p className="mt-1">
                Check the{" "}
                <Link href="/standup" className="text-tealhi hover:underline">
                  Standup
                </Link>{" "}
                page to update.
              </p>
            </div>
          ) : (
            <div className="mt-2 text-[13px] text-muted">
              You haven&apos;t posted today yet — it takes 30 seconds.
              <Link
                href="/standup"
                className="mt-2 ml-2 inline-flex items-center gap-1 rounded-md bg-teal px-2.5 py-1 text-[12px] font-semibold text-white"
              >
                Post standup <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </Card>

        <Card className="!bg-raised p-4">
          <SectionLabel>Recently completed</SectionLabel>
          {done.length === 0 ? (
            <EmptyState title="No wins yet" hint="Mark something done and it shows up here." />
          ) : (
            <ul className="mt-2 space-y-1.5">
              {done.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink line-through decoration-edge">
                    {t.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-emerald">✓</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* My projects */}
      <Card className="!bg-raised p-4">
        <SectionLabel>My projects · {projects.length}</SectionLabel>
        {projects.length === 0 ? (
          <EmptyState title="No linked projects" hint="Projects appear here once you have tasks in them." />
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="rounded-md border border-hover bg-bg px-3 py-1.5 text-[13px] text-ink hover:border-edge"
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
          <Link href="/tasks?assignee=me" className="text-tealhi hover:underline">
            All my tasks →
          </Link>
          <Link href="/tasks" className="text-tealhi hover:underline">
            Board →
          </Link>
          <span className="text-muted">· ~{velocity.weekHours}h logged this week</span>
        </div>
      </Card>

      {/* Complete Modal */}
      {completingTask && (
        <CompleteTaskModal
          open={true}
          taskId={completingTask.id}
          taskCode={completingTask.code}
          isLeaderOrCreator={Boolean(
            ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(me?.role ?? "")
          )}
          onClose={() => setCompletingTask(null)}
          onCompleted={() => {
            setCompletingTask(null);
            router.refresh();
          }}
        />
      )}

      {/* Task Drawer */}
      <TaskDrawer
        open={drawerOpen}
        task={drawerTask}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTaskId(null);
        }}
        onStatus={async (id, status, reason) => {
          await fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", status, reason }),
          });
          router.refresh();
        }}
        onSubtask={async (taskId, subtaskId, done) => {
          await fetch(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "subtask", subtaskId, done }),
          });
          router.refresh();
        }}
      />
    </div>
  );
}
