"use client";

import { X, Trash2, FolderKanban, Building2, CheckSquare, Pencil } from "lucide-react";
import { Avatar, Badge, SectionLabel } from "@/components/ui";
import { STATUS_COLOR } from "@/components/clients/ClientsView";
import { EntityLink } from "@/components/entity/EntityLink";

export interface ProjectDetailTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueLabel: string | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  category: string | null;
  status: string;
  description: string | null;
  client: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  service: { id: string; name: string; tier: string | null } | null;
  deliverables: unknown[] | null;
  progressPct: number | null;
  tasks: ProjectDetailTask[];
}

export function ProjectDetailDrawer({
  project,
  open,
  onClose,
  onDelete,
  onEdit,
  inline = false,
}: {
  inline?: boolean;
  project: ProjectDetail | null;
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit?: (project: ProjectDetail) => void;
}) {
  if (!open || !project) return null;
  const color = STATUS_COLOR[project.status] ?? "var(--muted)";
  const deliverableNames =
    Array.isArray(project.deliverables)
      ? project.deliverables.map((d) => (typeof d === "string" ? d : (d as { name?: string }).name ?? JSON.stringify(d)))
      : [];

  return (
    <div className={inline ? "flex h-full min-h-0 w-full" : "fixed inset-0 z-[70] flex justify-end bg-black/50 anim-fade"} onMouseDown={inline ? undefined : onClose}>
      <div
        className={inline ? "flex h-full w-full min-w-0 flex-col overflow-hidden bg-raised" : "flex h-full w-full max-w-md flex-col overflow-hidden border-l border-edge bg-raised shadow-xl anim-right"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-edge px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/25 text-tealhi">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">{project.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {project.status}
              </span>
              {project.category && <Badge text={project.category} kind="info" />}
              {project.service?.tier && <Badge text={project.service.tier} />}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(project)}
                className="text-muted hover:text-tealhi"
                aria-label="Edit project"
              >
                <Pencil className="h-4.5 w-4.5" />
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) onDelete(project.id);
              }}
              className="text-muted hover:text-crimson"
              aria-label="Delete project"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-edge px-4 py-3">
          <div>
            <div className="label">Client</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink">
              <Building2 className="h-3.5 w-3.5 text-muted" />
              {project.client?.name ?? "Unlinked"}
            </div>
          </div>
          <div>
            <div className="label">Owner</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink">
              {project.owner?.name
                ? <><Avatar name={project.owner.name} size={16} /> <EntityLink entity={{ type: "person", id: project.owner.id, name: project.owner.name }} /></>
                : "Unassigned"}
            </div>
          </div>
          {project.service && (
            <>
              <div>
                <div className="label">Service</div>
                <div className="mt-0.5 text-[13px] text-tealhi">{project.service.name}</div>
              </div>
              {project.progressPct != null && (
                <div>
                  <div className="label">Progress</div>
                  <div className="mt-0.5 tnum text-[13px] text-ink">{project.progressPct}%</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Deliverables */}
        {deliverableNames.length > 0 && (
          <div className="border-b border-edge px-4 py-3">
            <SectionLabel>Deliverables</SectionLabel>
            <div className="mt-2 space-y-1">
              {deliverableNames.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-ink">
                  <span className="h-1 w-1 rounded-full bg-teal" />{d}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <SectionLabel><span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" /> Tasks ({project.tasks.length})</span></SectionLabel>
          <div className="mt-2 space-y-1">
            {project.tasks.length === 0 && <p className="text-[12px] text-muted">No tasks for this project yet.</p>}
            {project.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-bg">
                <Badge text={t.priority} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.title}</span>
                <span className="font-mono text-[11px] text-faint">{t.code}</span>
              </div>
            ))}
          </div>
        </div>

        {project.description && (
          <div className="border-t border-edge px-4 py-3">
            <SectionLabel>Notes</SectionLabel>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{project.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}