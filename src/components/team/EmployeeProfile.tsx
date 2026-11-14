"use client";
import { BackButton } from "@/components/ui/BackButton";
import { StarButton } from "@/components/StarButton";
import { TrackRecent } from "@/components/TrackRecent";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Avatar, Badge, Bar, Card, EmptyState, SectionLabel, Stat } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { EmployeeSelfEdit } from "@/components/team/EmployeeSelfEdit";
import { ROLE_LABELS } from "@/lib/rbac";
import { timeAgo } from "@/lib/utils";
import type { Role } from "@prisma/client";

interface TaskRow {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueLabel: string | null;
  dueDate: string | Date | null;
  completedAt: string | Date | null;
  creator?: { id: string; name: string } | null;
  assignees?: { id: string; name: string }[];
}
interface ProjectRow {
  id: string;
  name: string;
  status: string;
  client: { id: string; name: string } | null;
}
interface ClientRow {
  id: string;
  name: string;
  health: string;
}
interface LearningRow {
  enrollmentId: string;
  course: { id: string; slug: string; title: string };
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  blocksDone: number;
  blocksTotal: number;
}
interface ActivityRow {
  id: string;
  type: string;
  occurredAt: string | Date;
  payload: unknown;
}
export interface EmployeeProfileData {
  id: string;
  name: string;
  title: string | null;
  role: Role;
  avatarInitials: string | null;
  status: string;
  department: { id: string; name: string; color: string } | null;
  manager: { id: string; name: string } | null;
  dob: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  workVisible: boolean;
  tasks: TaskRow[];
  projects: ProjectRow[];
  clients: ClientRow[];
  learning: LearningRow[];
  recentActivity: ActivityRow[];
  assignableEmployees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

const TASK_STATUS_KEY: Record<string, string> = { TODO: "todo", IN_PROGRESS: "inprogress", BLOCKED: "blocked", DONE: "done" };
const LEARNING_BADGE: Record<LearningRow["status"], string> = { NOT_STARTED: "todo", IN_PROGRESS: "inprogress", COMPLETED: "done" };
const TABS = ["Tasks", "Projects", "Clients", "Learning"] as const;
type Tab = (typeof TABS)[number];

function activityLabel(a: ActivityRow): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "TASK_CREATED":
      return `created task ${typeof p.code === "string" ? p.code : ""}`.trim();
    case "TASK_STATUS_CHANGED":
    case "TASK_BLOCKED":
      return `moved a task ${String(p.from ?? "")} → ${String(p.to ?? "")}`.trim();
    case "TASK_COMPLETED":
      return "completed a task";
    case "TASK_REOPENED":
      return "reopened a task";
    case "TASK_STARTED":
      return "started working on a task";
    case "TASK_PAUSED":
      return "paused a task";
    case "SUBTASK_TOGGLED":
      return `marked a subtask ${p.done ? "done" : "not done"}`;
    case "COURSE_STARTED":
      return "started a learning module";
    case "COURSE_COMPLETED":
      return "finished a learning module";
    case "AUTH_LOGIN":
      return "logged in";
    default:
      return a.type.toLowerCase().replace(/_/g, " ");
  }
}

export function EmployeeProfile({
  data,
  canCreateTask,
  currentUserId,
  currentUserName,
}: {
  data: EmployeeProfileData;
  canCreateTask: boolean;
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Tasks");
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let open = 0, overdue = 0, completedThisWeek = 0;
    for (const t of data.tasks) {
      if (t.status !== "DONE") {
        open++;
        if (t.dueDate && +new Date(t.dueDate) < now) overdue++;
      } else if (t.completedAt && +new Date(t.completedAt) >= weekAgo) {
        completedThisWeek++;
      }
    }
    return { open, overdue, completedThisWeek };
  }, [data.tasks]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center">
        <BackButton fallbackHref="/directory" />
      </div>
      <div className="mb-6 flex flex-wrap items-center ga">
        <Avatar name={data.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xl font-semibold text-ink">{data.name}</div>
            <StarButton label={data.name} path={`/team/${data.id}`} />
            <TrackRecent type="person" id={data.id} label={data.name} path={`/team/${data.id}`} />
            {data.status !== "ACTIVE" && <Badge text={data.status.toLowerCase()} kind="info" />}
          </div>
          <div className="mt-0.5 text-[13px] text-muted">
            {data.title ?? ROLE_LABELS[data.role]}
            {data.department && (
              <>
                {" · "}
                <span style={{ color: data.department.color }}>{data.department.name}</span>
              </>
            )}
            {data.manager && <> · reports to {data.manager.name}</>}
          </div>
        </div>
        <div className="flex gap-6">
          <Stat label="open tasks" value={data.workVisible ? stats.open : "—"} accent={stats.overdue > 0 ? "var(--crimson)" : undefined} />
          <Stat label="overdue" value={data.workVisible ? stats.overdue : "—"} accent={stats.overdue > 0 ? "var(--crimson)" : undefined} />
          <Stat label="done this week" value={data.workVisible ? stats.completedThisWeek : "—"} accent="var(--emerald)" />
          <Stat label="modules in progress" value={data.learning.filter((l) => l.status === "IN_PROGRESS").length} />
        </div>
        {currentUserId === data.id && (
          <EmployeeSelfEdit
            data={{
              name: data.name,
              title: data.title,
              dob: data.dob,
              personalPhone: data.personalPhone,
              personalEmail: data.personalEmail,
              workEmail: data.workEmail,
              emergencyContactName: data.emergencyContactName,
              emergencyContactPhone: data.emergencyContactPhone,
            }}
          />
        )}
        {canCreateTask && (
          <button
            onClick={() => setNewTaskOpen(true)}
 className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white transition hover:bg-tealhi"
          >
            <Plus className="h-3.5 w-3.5" /> New task for {data.name.split(" ")[0]}
          </button>
        )}
      </div>

      {data.workVisible && data.recentActivity.length > 0 && (
        <div className="mb-6 divide-y divide-line">
          <div className="px-4 py-2 text-[11px] text-muted">Recent activity</div>
          {data.recentActivity.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
              <span className="text-ink">{activityLabel(a)}</span>
              <span className="text-[11px] text-muted">{timeAgo(a.occurredAt)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-edge">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-3 py-2 text-[13px] " +
              (tab === t ? "rounded-full bg-hover text-ink" : "text-muted hover:text-ink")
            }
          >
            {t}
            {t === "Tasks" && data.workVisible && <span className="ml-1.5 text-[11px] text-muted">{data.tasks.length}</span>}
          </button>
        ))}
      </div>

      {tab !== "Learning" && !data.workVisible ? (
        <EmptyState
          title="Task and client detail is limited to your own department"
          hint="You can see this person's learning progress in the Learning tab, but their tasks, projects and clients aren't visible from outside their department."
        />
      ) : (
        <>
          {tab === "Tasks" && (
            data.tasks.length === 0 ? (
              <EmptyState title="No tasks assigned" />
            ) : (
              <div className="divide-y divide-line">
                {data.tasks.map((t) => (
                  <div key={t.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-muted shrink-0">{t.code}</span>
                      <EntityLink entity={{ type: "task", id: t.id, name: t.title }} className="min-w-0 flex-1 truncate" />
                      <Badge text={t.priority} />
                      <Badge text={TASK_STATUS_KEY[t.status] ?? t.status} />
                      {t.dueLabel && <span className="text-[11px] text-muted shrink-0">{t.dueLabel}</span>}
                    </div>
                    {(t.creator || (t.assignees && t.assignees.length > 0)) && (
                      <div className="flex items-center gap-2 pl-8 text-[11px] text-muted">
                        {t.creator && <span>by {t.creator.name.split(" ")[0]}</span>}
                        {t.assignees && t.assignees.length > 0 && (
                          <span className="text-faint">→ {t.assignees.map((a: {id:string;name:string}) => a.name.split(" ")[0]).join(", ")}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "Projects" && (
            data.projects.length === 0 ? (
              <EmptyState title="Not involved in any projects" />
            ) : (
              <div className="divide-y divide-line">
                {data.projects.map((p) => (
                  <div key={p.id} className="px-4 py-2.5">
                    <EntityLink entity={{ type: "project", id: p.id, name: p.name }} />
                    {p.client && (
                      <span className="ml-2 text-[12px] text-muted">
                        · <EntityLink entity={{ type: "client", id: p.client.id, name: p.client.name }} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "Clients" && (
            data.clients.length === 0 ? (
              <EmptyState title="Not the owner of any client" />
            ) : (
              <div className="divide-y divide-line">
                {data.clients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                    <EntityLink entity={{ type: "client", id: c.id, name: c.name }} />
                    <Badge text={c.health.toLowerCase()} kind="info" />
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "Learning" && (
            data.learning.length === 0 ? (
              <EmptyState title="No modules started yet" />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.learning.map((l) => {
                  const pct = l.blocksTotal ? (l.blocksDone / l.blocksTotal) * 100 : 0;
                  return (
                    <Card key={l.enrollmentId} className="p-4">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="font-medium text-ink">{l.course.title}</div>
                        <Badge text={LEARNING_BADGE[l.status]} />
                      </div>
                      <Bar pct={pct} color={l.status === "COMPLETED" ? "var(--emerald)" : "var(--teal)"} />
                      <div className="mt-1 text-[11px] text-muted">{l.blocksDone} / {l.blocksTotal} blocks</div>
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {canCreateTask && (
        <NewTaskModal
          open={newTaskOpen}
          onClose={() => setNewTaskOpen(false)}
          employees={data.assignableEmployees}
          departments={data.departments}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          canAssign
          defaultAssigneeIds={[data.id]}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
