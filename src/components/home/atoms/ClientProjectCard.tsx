"use client";

import React, { useState } from "react";
import {
  FolderGit2,
  ChevronRight,
  Send,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
} from "lucide-react";
import { PlainHelperTooltip } from "./DashboardAtoms";

export interface ClientProjectItem {
  id: string;
  name: string;
  code?: string | null;
  clientName?: string;
  status: string; // "ACTIVE" | "IN_PROGRESS" | "REVIEW" | "BLOCKED" | "COMPLETED"
  stage?: string;
  health?: "HEALTHY" | "AT_RISK" | "DELAYED";
  progressPct?: number;
  lastUpdated?: string;
  ownerName?: string;
  openTasksCount?: number;
  blockersCount?: number;
  latestUpdateNote?: string;
}

export function ClientProjectCard({
  project,
  employees = [],
  onOpenTasks,
  onNewWorkOrder,
  onQuickUpdate,
  onHandover,
}: {
  project: ClientProjectItem;
  employees?: { id: string; name: string }[];
  onOpenTasks?: (projectId: string) => void;
  onNewWorkOrder?: (projectId: string) => void;
  onQuickUpdate?: (projectId: string, status: string, note?: string) => void;
  onHandover?: (projectId: string, employeeId: string, note?: string) => void;
}) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateNote, setUpdateNote] = useState("");
  const [newStatus, setNewStatus] = useState(project.status);

  const healthColor =
    project.health === "AT_RISK"
      ? "bg-amber text-amber border-amber/30"
      : project.health === "DELAYED"
      ? "bg-crimson text-crimson border-crimson/30"
      : "bg-teal text-teal border-teal/30";

  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm hover:border-hover transition flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-teal/15 text-tealhi font-mono text-[10px] font-bold">
                {project.code?.slice(0, 3) || "PRJ"}
              </div>
              <h4 className="text-[14px] font-semibold text-ink truncate">{project.name}</h4>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono border ${healthColor} bg-opacity-10`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {project.health || "HEALTHY"}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted truncate">
              Client: <span className="font-medium text-ink">{project.clientName || "Internal"}</span>
              {project.stage && <span> · Stage: {project.stage}</span>}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onNewWorkOrder?.(project.id)}
              className="flex items-center gap-1 rounded bg-teal/15 px-2 py-1 text-[11.5px] font-medium text-tealhi hover:bg-teal hover:text-bg transition shadow-sm"
              title="Delegate work order for this project"
            >
              <Plus className="h-3 w-3" />
              <span>Delegate</span>
            </button>
          </div>
        </div>

        {/* Status / Last Note */}
        {project.latestUpdateNote ? (
          <div className="mt-3 rounded-lg border border-edge bg-bg p-2.5 text-[12px] text-ink">
            <div className="flex items-center justify-between text-[10.5px] text-muted mb-1">
              <span className="font-semibold text-ink">Latest Update</span>
              {project.lastUpdated && <span>{project.lastUpdated}</span>}
            </div>
            <p className="line-clamp-2 text-muted">{project.latestUpdateNote}</p>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted bg-bg p-2 rounded-lg border border-edge">
            <span>Owner: {project.ownerName || "Unassigned"}</span>
            <span>{project.openTasksCount || 0} active work orders</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-3 pt-3 border-t border-hover flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setUpdateOpen(!updateOpen)}
            className="rounded border border-edge bg-bg px-2.5 py-1 text-[11.5px] font-medium text-muted hover:border-teal hover:text-tealhi transition"
          >
            Update Status
          </button>
          {project.blockersCount && project.blockersCount > 0 ? (
            <span className="flex items-center gap-1 rounded bg-crimson/15 px-1.5 py-0.5 text-[10.5px] font-bold text-crimson font-mono">
              ⚑ {project.blockersCount} Blocked
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onOpenTasks?.(project.id)}
          className="flex items-center gap-1 text-[11.5px] font-medium text-tealhi hover:underline"
        >
          <span>View Tasks</span>
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Quick Update Drawer/Inline */}
      {updateOpen && (
        <div className="mt-3 rounded-lg border border-teal/40 bg-surface p-3 anim-up space-y-2.5">
          <div className="text-[11.5px] font-semibold text-tealhi">Post Project Update</div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="rounded border border-edge bg-bg px-2 py-1 text-[12px] text-ink focus:border-teal focus:outline-none"
            >
              <option value="ACTIVE">Active / In Progress</option>
              <option value="REVIEW">In Client Review</option>
              <option value="DELAYED">Delayed / Action Req.</option>
              <option value="COMPLETED">Delivered / Completed</option>
            </select>
          </div>
          <textarea
            rows={2}
            value={updateNote}
            onChange={(e) => setUpdateNote(e.target.value)}
            placeholder="What is the status or next milestone delivery date?"
            className="w-full rounded border border-edge bg-bg p-2 text-[12px] text-ink focus:border-teal focus:outline-none resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setUpdateOpen(false)}
              className="rounded px-2.5 py-1 text-[11.5px] text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onQuickUpdate?.(project.id, newStatus, updateNote);
                setUpdateOpen(false);
                setUpdateNote("");
              }}
              className="rounded bg-teal px-3 py-1 text-[11.5px] font-semibold text-bg hover:bg-tealhi"
            >
              Save Update
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
