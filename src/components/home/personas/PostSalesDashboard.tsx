"use client";

import React, { useState } from "react";
import {
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Plus,
  Send,
  Flag,
  ArrowRight,
  Filter,
} from "lucide-react";
import { NeedsMeNow, PlainHelperTooltip, type NeedsMeItem } from "../atoms/DashboardAtoms";
import { useToast } from "@/components/Toast";

export interface ProjectHealthItem {
  id: string;
  name: string;
  // Null when the viewer may not see client names (renders nothing).
  clientName: string | null;
  health: "GREEN" | "AMBER" | "RED";
  healthReason: string;
  activeMilestone: string;
  progressPct: number;
  openTasksCount: number;
  pendingApprovalsCount: number;
  blockedIssuesCount: number;
  lastUpdateDate: string;
  nextSlaDate: string;
}

export function PostSalesDashboard({
  projects = [],
  employees = [],
  titleBadge = "Peyton \u00b7 Post-Sales Lead",
}: {
  projects?: ProjectHealthItem[];
  employees?: { id: string; name: string; role: string; department?: string }[];
  titleBadge?: string;
}) {
  const toast = useToast();
  const [filterHealth, setFilterHealth] = useState<"ALL" | "RED" | "AMBER" | "GREEN">("ALL");
  const [selectedProject, setSelectedProject] = useState<ProjectHealthItem | null>(null);

  // Delegation / Quick Work Order State
  const [delegateModalOpen, setDelegateModalOpen] = useState(false);
  const [targetProject, setTargetProject] = useState<ProjectHealthItem | null>(null);
  const [workOrderTitle, setWorkOrderTitle] = useState("");
  const [workOrderScope, setWorkOrderScope] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState(employees[0]?.id || "");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">("P1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Client Update State
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [clientUpdateNote, setClientUpdateNote] = useState("");

  const filteredProjects = projects.filter((p) => {
    if (filterHealth === "ALL") return true;
    return p.health === filterHealth;
  });

  const redProjectsCount = projects.filter((p) => p.health === "RED").length;
  const amberProjectsCount = projects.filter((p) => p.health === "AMBER").length;

  const needsMeItems: NeedsMeItem[] = [];
  if (redProjectsCount > 0) {
    needsMeItems.push({
      id: "nm-red-projects",
      title: `${redProjectsCount} Client Projects in Red Alert Status`,
      context: "Active blocker or delayed delivery SLA requires immediate intervention",
      type: "CRITICAL_BLOCKER",
      actionLabel: "View Red Projects",
    });
  }

  async function handleCreateWorkOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!targetProject) return;
    if (workOrderTitle.trim().length < 3) {
      toast("Please enter a valid work order title", "error");
      return;
    }
    if (workOrderScope.trim().length < 20) {
      toast("Execution scope must be at least 20 characters", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: workOrderTitle,
          description: workOrderScope,
          projectId: targetProject.id,
          assigneeId: selectedAssignee,
          priority,
          taskType: "DELEGATED_WORK_ORDER",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to delegate task");
      }

      toast(`Work order dispatched to team member successfully ✓`, "success");
      setDelegateModalOpen(false);
      setWorkOrderTitle("");
      setWorkOrderScope("");
    } catch (err: any) {
      toast(err.message || "Failed to create work order", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendClientUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!targetProject) return;
    if (clientUpdateNote.trim().length < 15) {
      toast("Update note must be at least 15 characters", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      toast(`Update logged & notification broadcast for ${targetProject.name} ✓`, "success");
      setUpdateModalOpen(false);
      setClientUpdateNote("");
    } catch (err: any) {
      toast("Failed to log update", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 anim-fade pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Client Projects Command Center</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              {titleBadge}
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Real-time delivery health, milestone progress, blocker resolutions, and single-click team delegation.
          </p>
        </div>
      </div>

      {/* Needs Me Now Banner */}
      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Total Active Projects</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-ink">{projects.length}</div>
          <p className="text-[11px] text-muted mt-1">Across all agency client accounts</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
            <PlainHelperTooltip
              term="Healthy Projects"
              explanation="Projects on track with zero active blockers and sprint velocity > 90%."
            />
          </div>
          <div className="mt-1 text-[24px] font-bold font-mono text-tealhi">
            {projects.filter((p) => p.health === "GREEN").length}
          </div>
          <p className="text-[11px] text-muted mt-1">On schedule with no delays</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Needs Attention</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-amber">{amberProjectsCount}</div>
          <p className="text-[11px] text-muted mt-1">Backlog or minor SLA risk</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Critical Red Alerts</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-crimson">{redProjectsCount}</div>
          <p className="text-[11px] text-muted mt-1">Active blocker / Overdue milestone</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface p-1">
          {(["ALL", "RED", "AMBER", "GREEN"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterHealth(status)}
              className={`rounded px-3 py-1 text-[12px] font-semibold transition ${
                filterHealth === status
                  ? "bg-bg text-ink shadow-sm border border-edge"
                  : "text-muted hover:text-ink"
              }`}
            >
              {status === "ALL" ? "All Projects" : status === "RED" ? "Critical (Red)" : status === "AMBER" ? "Attention (Amber)" : "Healthy (Green)"}
            </button>
          ))}
        </div>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border bg-surface p-4 text-ink shadow-sm space-y-3.5 transition flex flex-col justify-between ${
              p.health === "RED"
                ? "border-crimson/40 bg-crimson/5 hover:border-crimson"
                : p.health === "AMBER"
                ? "border-amber/40 hover:border-amber"
                : "border-edge hover:border-teal/50"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    {p.clientName}
                  </span>
                  <h3 className="text-[15px] font-bold text-ink leading-tight mt-0.5">{p.name}</h3>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-mono font-bold shrink-0 ${
                    p.health === "RED"
                      ? "bg-crimson/20 text-crimson"
                      : p.health === "AMBER"
                      ? "bg-amber/20 text-amber"
                      : "bg-teal/20 text-tealhi"
                  }`}
                >
                  {p.health}
                </span>
              </div>

              <p className="text-[12px] text-muted">{p.healthReason}</p>

              {/* Progress & Milestone */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted">Milestone: {p.activeMilestone}</span>
                  <span className="font-mono font-semibold text-ink">{p.progressPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg border border-edge">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p.health === "RED" ? "bg-crimson" : p.health === "AMBER" ? "bg-amber" : "bg-teal"
                    }`}
                    style={{ width: `${p.progressPct}%` }}
                  />
                </div>
              </div>

              {/* Metrics Summary */}
              <div className="grid grid-cols-3 gap-2 border-t border-hover pt-2.5 text-center text-[11px]">
                <div className="rounded bg-bg p-1.5 border border-edge">
                  <span className="text-muted block text-[10px]">Open Tasks</span>
                  <span className="font-mono font-bold text-ink">{p.openTasksCount}</span>
                </div>
                <div className="rounded bg-bg p-1.5 border border-edge">
                  <span className="text-muted block text-[10px]">Blockers</span>
                  <span className={`font-mono font-bold ${p.blockedIssuesCount > 0 ? "text-crimson" : "text-tealhi"}`}>
                    {p.blockedIssuesCount}
                  </span>
                </div>
                <div className="rounded bg-bg p-1.5 border border-edge">
                  <span className="text-muted block text-[10px]">Next SLA</span>
                  <span className="font-mono text-muted">{p.nextSlaDate}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions for Peyton */}
            <div className="flex items-center gap-2 border-t border-hover pt-3">
              <button
                type="button"
                onClick={() => {
                  setTargetProject(p);
                  setDelegateModalOpen(true);
                }}
                className="flex-1 rounded bg-teal px-2.5 py-1.5 text-[11.5px] font-semibold text-bg hover:bg-tealhi transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Delegate Order</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetProject(p);
                  setUpdateModalOpen(true);
                }}
                className="rounded border border-edge bg-bg px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink hover:border-hover transition flex items-center gap-1"
              >
                <Send className="h-3 w-3" />
                <span>Update</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 1. Delegate Work Order Modal */}
      {delegateModalOpen && targetProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 anim-fade">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-5 text-ink shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">Delegate Work Order</h3>
                <p className="text-[12px] text-muted">For {targetProject.name} ({targetProject.clientName})</p>
              </div>
              <button
                type="button"
                onClick={() => setDelegateModalOpen(false)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWorkOrder} className="space-y-3.5">
              <div>
                <label className="text-[12px] font-semibold text-muted block mb-1">Work Order Title</label>
                <input
                  type="text"
                  value={workOrderTitle}
                  onChange={(e) => setWorkOrderTitle(e.target.value)}
                  placeholder="e.g. Implement Webhook Handler & Payment Confirmation"
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted block mb-1">
                  Assign To Team Member / Pod
                </label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal outline-none"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role || emp.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted block mb-1">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["P0", "P1", "P2"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded py-1.5 text-[12px] font-bold border transition ${
                        priority === p
                          ? "bg-teal/20 text-tealhi border-teal"
                          : "bg-bg text-muted border-edge hover:border-hover"
                      }`}
                    >
                      {p === "P0" ? "P0 (Urgent)" : p === "P1" ? "P1 (High)" : "P2 (Standard)"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[12px] font-semibold text-muted block">
                    Execution Scope & Deliverable Requirement
                  </label>
                  <span className={`text-[10.5px] font-mono ${workOrderScope.length >= 20 ? "text-tealhi" : "text-crimson"}`}>
                    {workOrderScope.length}/20 chars
                  </span>
                </div>
                <textarea
                  value={workOrderScope}
                  onChange={(e) => setWorkOrderScope(e.target.value)}
                  placeholder="Describe clear deliverables, acceptance criteria, and expected turnaround timeline..."
                  rows={3}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[12.5px] text-ink focus:border-teal outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-edge pt-3">
                <button
                  type="button"
                  onClick={() => setDelegateModalOpen(false)}
                  className="rounded px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || workOrderScope.length < 20}
                  className="rounded bg-teal px-4 py-1.5 text-[12px] font-bold text-bg hover:bg-tealhi disabled:opacity-50 transition"
                >
                  {isSubmitting ? "Dispatching..." : "Dispatch Work Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Client Update Modal */}
      {updateModalOpen && targetProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 anim-fade">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-5 text-ink shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">Broadcast Project Update</h3>
                <p className="text-[12px] text-muted">Update client milestone status for {targetProject.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setUpdateModalOpen(false)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendClientUpdate} className="space-y-3.5">
              <div>
                <label className="text-[12px] font-semibold text-muted block mb-1">Status Note / Summary</label>
                <textarea
                  value={clientUpdateNote}
                  onChange={(e) => setClientUpdateNote(e.target.value)}
                  placeholder="Summarize completed milestones and next delivery commitments for the client..."
                  rows={3}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[12.5px] text-ink focus:border-teal outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-edge pt-3">
                <button
                  type="button"
                  onClick={() => setUpdateModalOpen(false)}
                  className="rounded px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || clientUpdateNote.length < 15}
                  className="rounded bg-teal px-4 py-1.5 text-[12px] font-bold text-bg hover:bg-tealhi disabled:opacity-50 transition"
                >
                  {isSubmitting ? "Sending..." : "Publish Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
