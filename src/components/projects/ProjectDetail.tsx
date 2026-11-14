"use client";

import { BackButton } from "@/components/ui/BackButton";
import { StarButton } from "@/components/StarButton";
import { TrackRecent } from "@/components/TrackRecent";
import { useState} from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Building2, User, ListChecks, Package, Plus } from "lucide-react";
import { Badge, Avatar, SectionLabel, Card } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { ProjectDevHub } from "@/components/projects/ProjectDevHub";
import type { EntityRef } from "@/types";

export interface ProjectDetailTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueLabel: string | null;
}

export interface ProjectDetailData {
  id: string;
  name: string;
  category: string | null;
  status: string;
  description: string | null;
  progressPct: number | null;
  deliverables: unknown[] | null;
  client: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  service: { id: string; name: string; tier: string | null } | null;
  tasks: ProjectDetailTask[];
}

/**
 * ProjectDetail — the full detail view for a project, used by the full page
 * (/projects/[id]) and (via the drawer) as a quick peek. Presentational: it
 * receives already-scoped data and renders it, with every entity name
 * (client, owner, service, task) itself a deep-link. Also the one place a
 * user can create a task scoped to this project without leaving the page.
 */
export function ProjectDetail({
  data,
  employees,
  departments,
  currentUserId,
  currentUserName,
  canAssign,
}: {
  data: ProjectDetailData;
  employees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [showNewTask, setShowNewTask] = useState(false);

  const client = data.client ? ref("client", data.client.id, data.client.name) : null;
  const owner = data.owner ? ref("person", data.owner.id, data.owner.name) : null;
  const service = data.service ? ref("project", data.service.id, data.service.name) : null;

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between">
        <BackButton fallbackHref="/projects" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Content pane */}
        <div className="min-w-0 space-y-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-tealhi">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <h1 className="text-[16px] font-semibold text-ink">{data.name}</h1>
                  <StarButton label={data.name} path={`/projects/${data.id}`} />
                  <TrackRecent type="project" id={data.id} label={data.name} path={`/projects/${data.id}`} />
                </div>
                <button
                  onClick={() => setShowNewTask(true)}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-teal px-2.5 text-[12px] font-medium text-white hover:bg-tealhi"
                >
                  <Plus className="h-3.5 w-3.5" /> New task
                </button>
              </div>
              {data.description && (
                <p className="mt-2 text-[13px] leading-relaxed text-ink2">{data.description}</p>
              )}
            </div>
          </div>

          {/* Tasks (dept-scoped to the viewer) */}
          <section>
            <div className="flex items-center gap-1.5 border-b border-line pb-2 text-[12px] font-medium text-muted">
              <ListChecks className="h-3.5 w-3.5" /> Tasks
              <span className="rounded-full bg-hover px-1.5 text-[11px] tnum text-ink2">{data.tasks.length}</span>
            </div>
            {data.tasks.length === 0 && (
              <div className="py-6 text-[13px] text-muted">No tasks lined up yet.</div>
            )}
            {data.tasks.map((t) => (
              <div key={t.id} className="flex min-h-[40px] items-center gap-2 border-b border-line px-1 hover:bg-hover">
                <Badge text={t.priority} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{t.title}</span>
                <EntityLink entity={taskRef(t.id, t.code)} className="text-[11px]" />
                {t.dueLabel && <span className="tnum text-[11px] text-amber">{t.dueLabel}</span>}
              </div>
            ))}
          </section>

          {/* Developer & Technical Hub */}
          <ProjectDevHub projectId={data.id} canManage={canAssign} />
        </div>

        {/* Quiet property column */}
        <aside className="space-y-5 text-[13px] lg:border-l lg:border-line lg:pl-5">
          <div>
            <div className="mb-2 text-[11px] font-medium text-muted">Properties</div>
            <dl className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Status</dt>
                <dd><Badge text={data.status} /></dd>
              </div>
              {data.category && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">Category</dt>
                  <dd className="text-ink">{data.category}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted"><Building2 className="h-3.5 w-3.5" /> Client</dt>
                <dd className="text-ink">
                  {client ? <EntityLink entity={client} /> : <span className="text-muted">Internal</span>}
                </dd>
              </div>
              {owner && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-muted"><User className="h-3.5 w-3.5" /> Owner</dt>
                  <dd className="flex items-center gap-1.5 text-ink">
                    <Avatar name={data.owner!.name} size={20} />
                    <EntityLink entity={owner} />
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted"><Package className="h-3.5 w-3.5" /> Service</dt>
                <dd className="flex items-center gap-1.5 text-ink">
                  {service ? <EntityLink entity={service} /> : <span className="text-muted">—</span>}
                  {data.service?.tier && <Badge text={data.service.tier} />}
                </dd>
              </div>
            </dl>
          </div>

          {typeof data.progressPct === "number" && (
            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-muted">
                <span>Progress</span>
                <span className="tnum text-ink2">{Math.round(data.progressPct)}%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full rounded-full bg-teal"
                  style={{ width: `${Math.max(0, Math.min(100, data.progressPct))}%` }}
                />
              </div>
            </div>
          )}

          {Array.isArray(data.deliverables) && data.deliverables.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-medium text-muted">Deliverables</div>
              <ul className="space-y-1 text-[12px] text-ink2">
                {(data.deliverables as { deliverable?: string }[]).map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-teal" />
                    {typeof d === "string" ? d : (d?.deliverable ?? "—")}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
        clients={data.client ? [{ id: data.client.id, name: data.client.name }] : []}
        projects={[{ id: data.id, name: data.name, category: data.category, clientId: data.client?.id ?? null }]}
        initialClientId={data.client?.id}
        initialProjectId={data.id}
      />
    </div>
  );
}

function ref(type: EntityRef["type"], id: string, name: string): EntityRef {
  return { type, id, name };
}
function taskRef(id: string, code: string): EntityRef {
  return { type: "task", id, name: code, code };
}