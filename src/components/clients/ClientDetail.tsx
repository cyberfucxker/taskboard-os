"use client";

import { BackButton } from "@/components/ui/BackButton";
import { StarButton } from "@/components/StarButton";
import { TrackRecent } from "@/components/TrackRecent";
import { useState} from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, FolderKanban, CheckSquare, Plus } from "lucide-react";
import { Badge, Avatar, SectionLabel, Card } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { useToast } from "@/components/Toast";
import type { EntityRef } from "@/types";

const HEALTH_COLOR: Record<string, string> = { HEALTHY: "var(--emerald)", WATCH: "var(--amber)", AT_RISK: "var(--crimson)" };
const PROJECT_STATUSES = ["ONBOARDING", "ACTIVE", "PAUSED", "COMPLETED", "OFFBOARDED"] as const;

export interface ClientDetailTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueLabel: string | null;
  assignee: string | null;
}

export interface ClientDetailData {
  id: string;
  name: string;
  industry: string | null;
  region: string | null;
  tier: string | null;
  health: string;
  description: string | null;
  owners: { id: string; name: string }[];
  projects: { id: string; name: string; status: string }[];
  tasks: ClientDetailTask[];
}

/**
 * ClientDetail — the shared detail view for a client, used inside the full
 * detail page (/clients/[id]) and (via the drawer) as a quick peek. Every
 * entity name (owner, project, task) is itself a deep-link. Also the one
 * place a user can create a task or project for this client without leaving
 * the page — both actions post straight back and refresh this same view.
 */
export function ClientDetail({
  data,
  employees,
  departments,
  currentUserId,
  currentUserName,
  canAssign,
}: {
  data: ClientDetailData;
  employees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  canAssign: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const health = HEALTH_COLOR[data.health] ?? "var(--muted)";

  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectOwnerId, setProjectOwnerId] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim() || creatingProject) return;
    setCreatingProject(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: data.id,
        name: projectName.trim(),
        ownerId: projectOwnerId || null,
      }),
    });
    const body = await res.json();
    setCreatingProject(false);
    if (body.ok) {
      toast(`Created project “${body.project.name}”`, "success");
      setProjectName("");
      setProjectOwnerId("");
      setShowNewProject(false);
      router.refresh();
    } else {
      toast(body.error ?? "Failed to create project", "error");
    }
  }

  async function updateProjectStatus(projectId: string, status: string) {
    setSavingStatusId(projectId);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json();
    setSavingStatusId(null);
    if (body.ok) {
      toast("Project updated", "success");
      router.refresh();
    } else {
      toast(body.error ?? "Failed to update project", "error");
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between">
        <BackButton fallbackHref="/clients" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Content pane */}
        <div className="min-w-0 space-y-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <h1 className="text-[16px] font-medium text-ink">{data.name}</h1>
                <StarButton label={data.name} path={`/clients/${data.id}`} />
                <TrackRecent type="client" id={data.id} label={data.name} path={`/clients/${data.id}`} />
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setShowNewProject((v) => !v)}
                  className="flex h-8 items-center gap-1 rounded-md border border-edge bg-raised px-2.5 text-[13px] font-medium text-ink hover:bg-hover"
                >
                  <Plus className="h-3.5 w-3.5" /> New project
                </button>
                <button
                  onClick={() => setShowNewTask(true)}
                  className="flex h-8 items-center gap-1 rounded-md bg-teal px-2.5 text-[13px] font-medium text-white hover:bg-tealhi"
                >
                  <Plus className="h-3.5 w-3.5" /> New task
                </button>
              </div>
            </div>
            {data.description && (
              <p className="mt-2 text-[13px] leading-relaxed text-ink2">{data.description}</p>
            )}

            {showNewProject && (
              <form
                onSubmit={createProject}
                className="mt-4 flex flex-wrap items-end gap-2 border-y border-line py-3"
              >
                <div className="min-w-[180px] flex-1">
                  <label className="mb-1 block text-[12px] text-muted">Project name</label>
                  <input
                    autoFocus
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Website revamp"
                    className="h-8 w-full rounded-md border border-edge bg-transparent px-2.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                  />
                </div>
                <div className="min-w-[150px]">
                  <label className="mb-1 block text-[12px] text-muted">Owner</label>
                  <select
                    value={projectOwnerId}
                    onChange={(e) => setProjectOwnerId(e.target.value)}
                    className="h-8 w-full rounded-md border border-edge bg-transparent px-2.5 text-[13px] text-ink focus:border-teal focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id} className="bg-raised">{e.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!projectName.trim() || creatingProject}
                  className="h-8 rounded-md bg-teal px-3 text-[13px] font-medium text-white hover:bg-tealhi disabled:opacity-50"
                >
                  {creatingProject ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="h-8 rounded-md px-2.5 text-[13px] text-muted hover:bg-hover hover:text-ink"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>

          {/* Projects — status editable inline */}
          <section>
            <div className="flex items-center gap-1.5 border-b border-line pb-2 text-[12px] font-medium text-muted">
              Projects
              <span className="tnum text-faint">{data.projects.length}</span>
            </div>
            {data.projects.length === 0 && <div className="py-6 text-[13px] text-muted">No projects yet.</div>}
            {data.projects.map((p) => (
              <div key={p.id} className="flex min-h-[40px] items-center justify-between gap-2 border-b border-line px-1 hover:bg-hover">
                <EntityLink entity={projectRef(p.id, p.name)} className="truncate text-[13px]" />
                <select
                  value={p.status}
                  disabled={savingStatusId === p.id}
                  onChange={(e) => updateProjectStatus(p.id, e.target.value)}
                  className="h-7 shrink-0 rounded-md border border-edge bg-transparent px-1.5 text-[12px] text-ink2 focus:border-teal focus:outline-none disabled:opacity-50"
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-raised">{s}</option>
                  ))}
                </select>
              </div>
            ))}
          </section>

          {/* Tasks (dept-scoped to the viewer) */}
          <section>
            <div className="flex items-center gap-1.5 border-b border-line pb-2 text-[12px] font-medium text-muted">
              Tasks
              <span className="tnum text-faint">{data.tasks.length}</span>
            </div>
            {data.tasks.length === 0 && <div className="py-6 text-[13px] text-muted">No tasks lined up yet.</div>}
            {data.tasks.map((t) => (
              <div key={t.id} className="flex min-h-[40px] items-center gap-2 border-b border-line px-1 hover:bg-hover">
                <Badge text={t.priority} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{t.title}</span>
                <EntityLink entity={taskRef(t.id, t.code)} className="font-mono text-[11px]" />
                {t.dueLabel && <span className="text-[12px] text-amber">{t.dueLabel}</span>}
              </div>
            ))}
          </section>
        </div>

        {/* Quiet property column */}
        <aside className="space-y-5 text-[13px] lg:border-l lg:border-line lg:pl-5">
          <dl className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Health</dt>
              <dd className="flex items-center gap-1.5 text-ink">
                <span className="h-2 w-2 rounded-full" style={{ background: health }} />
                {data.health}
              </dd>
            </div>
            {data.tier && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Tier</dt>
                <dd><Badge text={data.tier} /></dd>
              </div>
            )}
            {data.industry && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Industry</dt>
                <dd className="text-ink2">{data.industry}</dd>
              </div>
            )}
            {data.region && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Region</dt>
                <dd className="text-ink2">{data.region}</dd>
              </div>
            )}
          </dl>
          <div>
            <div className="mb-2 text-[12px] text-muted">Owners</div>
            <div className="space-y-1.5">
              {data.owners.length === 0 && <span className="text-[13px] text-muted">No owner assigned.</span>}
              {data.owners.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-ink">
                  <Avatar name={o.name} size={20} />
                  <EntityLink entity={personRef(o.id, o.name)} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <NewTaskModal
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        employees={employees}
        departments={departments}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        canAssign={canAssign}
        onCreated={() => router.refresh()}
        clients={[{ id: data.id, name: data.name }]}
        projects={data.projects.map((p) => ({ id: p.id, name: p.name, category: null }))}
        initialClientId={data.id}
      />
    </div>
  );
}

function personRef(id: string, name: string): EntityRef { return { type: "person", id, name }; }
function projectRef(id: string, name: string): EntityRef { return { type: "project", id, name }; }
function taskRef(id: string, code: string): EntityRef { return { type: "task", id, name: code, code }; }
