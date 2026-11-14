"use client";

/**
 * ProjectsCommandCenter — projects grouped by department (category),
 * tasks segregated by status within each card.
 * Health heuristic: RED = blocked tasks > 0, AMBER = overdue, else GREEN.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { dueCountdown } from "@/lib/projectVisibility";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toast";

export type ProjectHealth = "RED" | "AMBER" | "GREEN";

export interface ModalEmployee {
  id: string;
  name: string;
  role: string;
  title?: string | null;
  departmentSlug?: string | null;
}

export interface CommandProjectRow {
  id: string;
  name: string;
  category: string | null;
  status: string;
  progressPct: number | null;
  /** Already redacted server-side unless the viewer may see clients. */
  clientName: string | null;
  description: string | null;
  clientId: string;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  tasks: {
    id: string;
    code: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
  }[];
}

function healthOf(tasks: CommandProjectRow["tasks"]): { health: ProjectHealth; reason: string } {
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
  if (blocked > 0)
    return {
      health: "RED",
      reason: `${blocked} blocked task${blocked === 1 ? "" : "s"} need${blocked === 1 ? "s" : ""} intervention`,
    };
  const overdue = tasks.filter((t) => dueCountdown(t.dueDate)?.overdue ?? false).length;
  if (overdue > 0)
    return {
      health: "AMBER",
      reason: `${overdue} overdue task${overdue === 1 ? "" : "s"} at SLA risk`,
    };
  return { health: "GREEN", reason: "On track, no blockers or overdue tasks" };
}

const STATUS_ORDER: Record<string, number> = {
  IN_PROGRESS: 0,
  BLOCKED: 1,
  TODO: 2,
  DONE: 3,
};

function StatusIcon({ status }: { status: string }) {
  if (status === "IN_PROGRESS")
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-amber">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 1 A6 6 0 0 1 7 13" fill="currentColor" />
      </svg>
    );
  if (status === "BLOCKED")
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[var(--red)]">
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <rect x="4" y="6.25" width="6" height="1.5" rx="0.75" fill="white" />
      </svg>
    );
  if (status === "DONE")
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[var(--green)]">
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path d="M4.5 7l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  // TODO — dashed circle
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-muted">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

function TaskRow({ task }: { task: CommandProjectRow["tasks"][number] }) {
  const due = dueCountdown(task.dueDate);
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-[rgba(0,0,0,.04)] transition-colors"
    >
      <StatusIcon status={task.status} />
      <span className="font-mono text-[11px] text-muted shrink-0">{task.code}</span>
      <span className="flex-1 truncate text-ink2">{task.title}</span>
      {due && (
        <span className={cn("text-[11px] shrink-0", due.overdue ? "text-[var(--red)]" : "text-muted")}>
          {due.text}
        </span>
      )}
    </Link>
  );
}

function ProjectCard({
  p,
  canManage,
  onEdit,
  onDelete,
  onDelegate,
}: {
  p: CommandProjectRow & { health: ProjectHealth; reason: string };
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDelegate: () => void;
}) {
  const [doneExpanded, setDoneExpanded] = useState(false);

  const byStatus = useMemo(() => {
    const sorted = [...p.tasks].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
    );
    const groups: Record<string, typeof sorted> = {};
    for (const t of sorted) {
      if (!groups[t.status]) groups[t.status] = [];
      groups[t.status].push(t);
    }
    return groups;
  }, [p.tasks]);

  const statusGroups: Array<{ key: string; tasks: CommandProjectRow["tasks"] }> = [];
  for (const key of ["IN_PROGRESS", "BLOCKED", "TODO", "DONE"]) {
    if (byStatus[key]?.length) {
      statusGroups.push({ key, tasks: byStatus[key] });
    }
  }

  const healthColor =
    p.health === "RED"
      ? {
          border: "border-[var(--red,#e53e3e)]/40 hover:border-[var(--red,#e53e3e)]",
          badge: "bg-[var(--red-bg,#fff5f5)] text-[var(--red,#e53e3e)]",
        }
      : p.health === "AMBER"
      ? {
          border: "border-amber/40 hover:border-amber",
          badge: "bg-[var(--amber-bg,#fffbeb)] text-amber",
        }
      : {
          border: "hover:border-teal/50",
          badge: "bg-[var(--green-bg,#f0fff4)] text-[var(--green,#38a169)]",
        };

  return (
    <Card className={cn("flex flex-col space-y-3 transition", healthColor.border)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {p.clientName && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {p.clientName}
            </span>
          )}
          <h3 className="mt-0.5 text-[15px] font-bold leading-tight text-ink">
            <Link href={`/projects/${p.id}`} className="hover:text-tealhi">
              {p.name}
            </Link>
          </h3>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold", healthColor.badge)}>
          {p.health}
        </span>
      </div>

      {/* Progress bar */}
      {p.progressPct !== null && p.progressPct !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-muted">Progress</span>
            <span className="font-mono font-semibold text-ink">{p.progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-edge bg-bg">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                p.health === "RED"
                  ? "bg-[var(--red,#e53e3e)]"
                  : p.health === "AMBER"
                  ? "bg-amber"
                  : "bg-teal",
              )}
              style={{ width: `${Math.min(100, Math.max(0, p.progressPct))}%` }}
            />
          </div>
        </div>
      )}

      {/* Tasks by status */}
      <div className="space-y-2 border-t border-edge pt-2">
        {statusGroups.length === 0 ? (
          <p className="text-[12px] text-muted px-1.5 py-1">No tasks yet</p>
        ) : (
          statusGroups.map(({ key, tasks }) => {
            const isDone = key === "DONE";
            const shownTasks = isDone && !doneExpanded ? [] : tasks;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-wider px-1.5",
                      key === "IN_PROGRESS"
                        ? "text-amber"
                        : key === "BLOCKED"
                        ? "text-[var(--red,#e53e3e)]"
                        : key === "DONE"
                        ? "text-[var(--green,#38a169)]"
                        : "text-muted",
                    )}
                  >
                    {key.replace("_", " ")} ({tasks.length})
                  </span>
                  {isDone && (
                    <button
                      type="button"
                      onClick={() => setDoneExpanded(!doneExpanded)}
                      className="text-[11px] text-teal hover:text-tealhi px-1.5"
                    >
                      {doneExpanded ? "collapse" : `show ${tasks.length}`}
                    </button>
                  )}
                </div>
                {shownTasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex gap-2 border-t border-edge pt-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-edge bg-surface px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-edge bg-surface px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-[var(--red,#e53e3e)]"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onDelegate}
            className="flex-1 rounded-md bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-tealhi"
          >
            + Delegate
          </button>
        </div>
      )}
    </Card>
  );
}

export function ProjectsCommandCenter({
  projects,
  employees,
  departments,
  clients,
  manageClients,
  currentUserId,
  currentUserName,
  canManage,
}: {
  projects: CommandProjectRow[];
  employees: ModalEmployee[];
  departments: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  manageClients: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CommandProjectRow | null>(null);

  const withHealth = useMemo(
    () => projects.map((p) => ({ ...p, ...healthOf(p.tasks) })),
    [projects],
  );

  const red = withHealth.filter((p) => p.health === "RED").length;
  const amber = withHealth.filter((p) => p.health === "AMBER").length;
  const green = withHealth.filter((p) => p.health === "GREEN").length;

  const HEALTH_ORDER: Record<ProjectHealth, number> = { RED: 0, AMBER: 1, GREEN: 2 };

  const groups = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = withHealth.filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(q) ||
        (p.clientName ?? "").toLowerCase().includes(q),
    );
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const key = p.category ?? "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [withHealth, search]);

  async function deleteProject(id: string, name: string) {
    if (!window.confirm(`Delete project "${name}"? It will be soft-deleted and can be restored.`))
      return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      toast("Project deleted", "success");
      startTransition(() => router.refresh());
    } else toast(data.error ?? "Delete failed", "error");
  }

  return (
    <div className="space-y-5 p-4 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
        <div>
          <h1 className="text-[20px] font-bold text-ink">Projects Command Center</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Delivery health by department — attention queue, single-click delegation.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-tealhi"
            >
              + New Project
            </button>
          )}
          <Link
            href="/engagement"
            className="rounded-md border border-edge bg-surface px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
          >
            Engagement view
          </Link>
        </div>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
        <Stat label="Active projects" value={projects.length} accent="text-ink" />
        <Stat label="Healthy" value={green} accent="text-tealhi" />
        <Stat label="Needs attention" value={amber} accent="text-amber" />
        <Stat label="Critical" value={red} accent="text-crimson" />
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects or clients…"
          className="w-full rounded-lg border border-edge bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
      </div>

      {/* Department groups */}
      {groups.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-[13px] text-muted">No projects found.</div>
        </Card>
      ) : (
        groups.map(([dept, deptProjects]) => (
          <section key={dept} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-bold text-ink">{dept}</h2>
              <span className="rounded-full bg-[rgba(0,0,0,.06)] px-2 py-0.5 text-[11px] font-semibold text-muted">
                {deptProjects.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deptProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  canManage={canManage}
                  onEdit={() => setEditTarget(p)}
                  onDelete={() => deleteProject(p.id, p.name)}
                  onDelegate={() => setDelegateId(p.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <NewTaskModal
        open={delegateId !== null}
        onClose={() => setDelegateId(null)}
        employees={employees}
        departments={departments}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        canAssign={canManage}
        clients={clients}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        initialProjectId={delegateId ?? undefined}
        onCreated={() => startTransition(() => router.refresh())}
      />

      <NewProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clients={manageClients}
        employees={employees}
      />
      {editTarget && (
        <NewProjectModal
          open
          onClose={() => setEditTarget(null)}
          clients={manageClients}
          employees={employees}
          editProject={{
            id: editTarget.id,
            name: editTarget.name,
            category: editTarget.category,
            status: editTarget.status,
            description: editTarget.description,
            clientId: editTarget.clientId,
            ownerId: editTarget.ownerId,
            startDate: editTarget.startDate,
            endDate: editTarget.endDate,
          }}
        />
      )}
    </div>
  );
}
