"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Layers, LayoutGrid, Plus } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import { STATUS_COLOR } from "@/components/clients/ClientsView";
import { ProjectDetailDrawer, type ProjectDetail } from "@/components/projects/ProjectDetailDrawer";
import { NewProjectModal, type ProjectModalEmployee, type ProjectModalClient } from "@/components/projects/NewProjectModal";
import { DepartmentPipelinesHub } from "@/components/pipelines/DepartmentPipelinesHub";
import { ListToolbar, NoMatches, StickyList, useListFilter, useListKeys, useWideScreen } from "@/components/list";

const COLUMNS = ["ONBOARDING", "ACTIVE", "PAUSED", "COMPLETED", "OFFBOARDED"] as const;
const COLUMN_LABEL: Record<string, string> = {
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  OFFBOARDED: "Offboarded",
};

export function ProjectsBoard({
  projects,
  clients = [],
  employees = [],
  currentUserId,
  canManage = false,
}: {
  projects: ProjectDetail[];
  clients?: ProjectModalClient[];
  employees?: ProjectModalEmployee[];
  currentUserId?: string;
  canManage?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"board" | "pipelines">("board");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editProject, setEditProject] = useState<ProjectDetail | null>(null);
  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const router = useRouter();
  const wide = useWideScreen();
  const [activeId, setActiveId] = useState<string | null>(null);
  const pf = useListFilter(projects, (p) =>
    [p.name, p.client?.name, p.category, p.status].filter(Boolean).join(" ")
  );
  const boardOrder = useMemo(
    () => COLUMNS.flatMap((st) => pf.filtered.filter((p) => p.status === st).map((p) => p.id)),
    [pf.filtered]
  );
  useListKeys({ ids: boardOrder, activeId, onActive: setActiveId, onOpen: setSelectedId, enabled: activeTab === "board" });

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSelectedId(null);
        router.refresh();
      } else if (res.status === 403) {
        window.alert("You don't have permission to delete projects.");
      } else {
        window.alert(data?.error ?? "Could not delete project.");
      }
    } catch {
      window.alert("Could not delete project.");
    }
  }

  function handleEdit(project: ProjectDetail) {
    setEditProject(project);
    setSelectedId(null);
  }

  return (
    <StickyList
      header={
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-[14px] font-semibold tracking-tight text-ink">Projects and Engagements</h1>
            <span className="hidden truncate text-[12px] text-muted md:block">
              client engagements and standardized department pipelines
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canManage && activeTab === "board" && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-[12px] font-medium text-white hover:bg-tealhi"
              >
                <Plus className="h-3.5 w-3.5" /> New Project
              </button>
            )}
            <div className="flex items-center gap-1 rounded-lg border border-edge bg-raised p-1">
              <button
                onClick={() => setActiveTab("board")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "board" ? "bg-hover text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Status Board
              </button>
              <button
                onClick={() => setActiveTab("pipelines")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "pipelines" ? "bg-teal/20 text-tealhi border" : "text-muted hover:text-ink"
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-tealhi" /> Department Pipelines and SOPs
              </button>
            </div>
          </div>
        </div>
      }
      toolbar={
        activeTab === "board" ? (
          <ListToolbar filter={pf} noun="projects" placeholder="Filter projects..." />
        ) : undefined
      }
      peek={
        wide && selected ? (
          <ProjectDetailDrawer
            inline
            project={selected}
            open
            onClose={() => setSelectedId(null)}
            onDelete={handleDelete}
            onEdit={canManage ? handleEdit : undefined}
          />
        ) : null
      }
    >
      <div className="p-5 space-y-5">
        {activeTab === "board" && pf.filtered.length === 0 && pf.active && (
          <NoMatches filter={pf} />
        )}
        {activeTab === "pipelines" ? (
          <DepartmentPipelinesHub
            clients={clients}
            projects={projects.map((p) => ({ id: p.id, name: p.name, client: p.client }))}
            employees={employees}
            currentUserId={currentUserId}
          />
        ) : (
          <div className="flex items-start gap-3 overflow-x-auto pb-2">
            {COLUMNS.map((status) => {
              const items = pf.filtered.filter((p) => p.status === status);
              const color = STATUS_COLOR[status] ?? "var(--muted)";
              return (
                <div
                  key={status}
                  className="flex w-72 shrink-0 flex-col rounded-[10px] border border-edge bg-raised"
                >
                  <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                      <span className="text-[13px] font-medium text-ink">{COLUMN_LABEL[status]}</span>
                    </div>
                    <span className="tnum text-[11px] text-muted">{items.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {items.length === 0 && (
                      <p className="px-1 py-6 text-center text-[11px] text-faint">No projects</p>
                    )}
                    {items.map((p) => (
                      <div
                        key={p.id}
                        data-row-id={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setActiveId(p.id); setSelectedId(p.id); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedId(p.id);
                        }}
                        className="w-full text-left cursor-pointer"
                      >
                        <Card
                          className={`p-3 transition hover:border-teal/50 ${
                            activeId === p.id || selectedId === p.id ? "border-teal/60 bg-hover" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                              style={{
                                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
                              }}
                            >
                              <FolderKanban className="h-3.5 w-3.5" style={{ color }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span
                                className="inline-block max-w-[200px] truncate align-bottom font-medium text-ink"
                                title={p.name}
                              >
                                {p.name}
                              </span>
                              {p.client?.name && (
                                <div
                                  className="mt-0.5 truncate text-[11px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <EntityLink
                                    entity={{ type: "client", id: p.client.id, name: p.client.name }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {p.category && <Badge text={p.category} kind="info" />}
                            {p.tasks.length > 0 && (
                              <span className="tnum text-[11px] text-faint">{p.tasks.length} tasks</span>
                            )}
                            {p.progressPct != null && (
                              <span className="ml-auto tnum text-[11px]" style={{ color }}>
                                {p.progressPct}%
                              </span>
                            )}
                          </div>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <ProjectDetailDrawer
          project={selected}
          open={selectedId != null && !wide}
          onClose={() => setSelectedId(null)}
          onDelete={handleDelete}
          onEdit={canManage ? handleEdit : undefined}
        />
      </div>

      {showNewModal && (
        <NewProjectModal
          open
          onClose={() => setShowNewModal(false)}
          clients={clients}
          employees={employees}
        />
      )}
      {editProject && (
        <NewProjectModal
          open
          onClose={() => setEditProject(null)}
          clients={clients}
          employees={employees}
          editProject={{
            id: editProject.id,
            name: editProject.name,
            category: editProject.category,
            status: editProject.status,
            description: editProject.description,
            clientId: editProject.client?.id ?? "",
            ownerId: editProject.owner?.id ?? null,
          }}
        />
      )}
    </StickyList>
  );
}
