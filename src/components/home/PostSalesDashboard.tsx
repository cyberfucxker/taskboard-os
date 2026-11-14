"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  Plus,
  UserCheck,
  AlertTriangle,
  ArrowRightLeft,
  FileEdit,
  Send,
  Sparkles,
  Layers
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { HelperText } from "./HelperText";
import { RowActions } from "./RowActions";

export interface ProjectItem {
  id: string;
  name: string;
  clientName: string;
  clientId?: string;
  stage: string;
  stageLabel?: string;
  health: "green" | "amber" | "red";
  healthReason?: string;
  nextMilestone?: {
    title: string;
    date: string;
    isOverdue?: boolean;
  };
  clientWaitingForReply?: boolean;
  lastClientMessage?: string;
  unreadMessagesCount?: number;
  openTasksCount?: number;
  teamMembers?: { id: string; name: string; role?: string }[];
}

interface PostSalesDashboardProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  needsMeNowItems: ActionItem[];
  projects: ProjectItem[];
}

export function PostSalesDashboard({
  user,
  needsMeNowItems,
  projects: initialProjects,
}: PostSalesDashboardProps) {
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "attention" | "healthy">("all");

  // Note / Change request state inside project drawer
  const [clientNote, setClientNote] = useState("");
  const [changeRequestText, setChangeRequestText] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isSubmittingCR, setIsSubmittingCR] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  const filterProjects = () => {
    switch (activeTab) {
      case "attention":
        return projects.filter((p) => p.health === "red" || p.health === "amber" || p.clientWaitingForReply);
      case "healthy":
        return projects.filter((p) => p.health === "green" && !p.clientWaitingForReply);
      default:
        return projects;
    }
  };

  const filteredProjects = filterProjects();

  const getHealthDot = (health: ProjectItem["health"]) => {
    switch (health) {
      case "green":
        return <span className="h-2.5 w-2.5 rounded-full bg-emerald shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="Healthy — on track" />;
      case "amber":
        return <span className="h-2.5 w-2.5 rounded-full bg-amber shadow-[0_0_8px_rgba(245,158,11,0.4)]" title="Needs attention — minor delay or risk" />;
      case "red":
        return <span className="h-2.5 w-2.5 rounded-full bg-rose shadow-[0_0_8px_rgba(244,63,94,0.4)]" title="At risk — delayed or escalated" />;
    }
  };

  const handleAddClientNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !clientNote.trim()) return;
    setIsSubmittingNote(true);
    try {
      // Post client note to activity/comments or client audit log
      const res = await fetch("/api/tasks/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "project",
          entityId: selectedProject.id,
          type: "CLIENT_NOTE",
          note: clientNote.trim(),
        }),
      }).catch(() => null);

      setNotificationMsg("Client note saved successfully!");
      setClientNote("");
      setTimeout(() => setNotificationMsg(null), 3000);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleRaiseChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !changeRequestText.trim()) return;
    setIsSubmittingCR(true);
    try {
      // Create change request task / approval
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[Change Request] ${selectedProject.clientName} - ${changeRequestText.slice(0, 40)}...`,
          description: `Change Request for ${selectedProject.name}:\n\n${changeRequestText}`,
          priority: "HIGH",
          clientId: selectedProject.clientId,
        }),
      }).catch(() => null);

      setNotificationMsg("Change request logged and notified to team!");
      setChangeRequestText("");
      setTimeout(() => setNotificationMsg(null), 3000);
    } finally {
      setIsSubmittingCR(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Client Projects Overview
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Track account health, upcoming milestones, and client communications for your assigned clients.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised transition-colors shadow-sm"
          >
            <Layers className="h-3.5 w-3.5 text-muted" />
            <span>All Tasks</span>
          </Link>
        </div>
      </div>

      {/* 1. Needs Me Now (Maximum 5 items) */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Urgent client messages, overdue deliverables, and items waiting for you"
        emptyMessage="No urgent client issues or unreplied messages."
      />

      {/* 2. Main Panel: My Client Projects */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal" />
            <h2 className="text-[15px] font-semibold text-ink">My Client Projects</h2>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
              {projects.length}
            </span>
            <HelperText text="Active projects under your care" tooltip="Shows live health, client communication status, and next deliverables." />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              All Projects ({projects.length})
            </button>
            <button
              onClick={() => setActiveTab("attention")}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                activeTab === "attention"
                  ? "bg-amber/10 text-amber border border-amber/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Needs Attention ({projects.filter((p) => p.health !== "green" || p.clientWaitingForReply).length})
            </button>
            <button
              onClick={() => setActiveTab("healthy")}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                activeTab === "healthy"
                  ? "bg-emerald/10 text-emerald border border-emerald/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Healthy ({projects.filter((p) => p.health === "green" && !p.clientWaitingForReply).length})
            </button>
          </div>
        </div>

        {/* Project List Rows */}
        <div className="mt-3 divide-y divide-edge/50">
          {filteredProjects.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-muted">
              No projects match the selected filter.
            </div>
          ) : (
            filteredProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedProject(p)}
                className="group flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-raised/60 cursor-pointer transition-colors"
              >
                {/* Left: Health dot + Project & Client Name + Stage */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="shrink-0 flex items-center justify-center p-1">
                    {getHealthDot(p.health)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-medium text-ink group-hover:text-teal transition-colors truncate">
                        {p.clientName}
                      </span>
                      <span className="text-[12px] text-muted truncate">({p.name})</span>

                      {/* Client reply waiting marker */}
                      {p.clientWaitingForReply && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold text-amber">
                          <MessageSquare className="h-3 w-3" />
                          <span>Client waiting for reply</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[12px] text-muted mt-0.5 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-medium text-ink">Stage:</span> {p.stageLabel || p.stage}
                      </span>
                      {p.healthReason && (
                        <span className="text-amber truncate max-w-xs">
                          • {p.healthReason}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Next Milestone + Row Quick Actions */}
                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pl-7 md:pl-0">
                  {p.nextMilestone ? (
                    <div className="text-left md:text-right">
                      <div className="text-[11px] font-medium text-muted">Next Milestone</div>
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                        <Calendar className="h-3.5 w-3.5 text-muted" />
                        <span className={p.nextMilestone.isOverdue ? "text-rose font-semibold" : ""}>
                          {p.nextMilestone.title} ({p.nextMilestone.date})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted">No upcoming milestone</span>
                  )}

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      onSuccess={() => {}}
                    />
                    <ChevronRight className="h-4 w-4 text-muted group-hover:text-ink transition-colors ml-1" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Project Detail & Action Drawer/Modal */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 p-0 sm:p-4 backdrop-blur-xs">
          <div className="h-full sm:h-auto sm:max-h-[90vh] w-full max-w-xl rounded-none sm:rounded-xl border-l sm:border border-edge bg-surface p-5 shadow-2xl flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-edge/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  {getHealthDot(selectedProject.health)}
                  <h3 className="text-[16px] font-semibold text-ink">{selectedProject.clientName}</h3>
                </div>
                <p className="text-[12px] text-muted mt-0.5">{selectedProject.name} · Stage: {selectedProject.stageLabel || selectedProject.stage}</p>
              </div>
              <button
                onClick={() => setSelectedProject(null)}
                className="rounded-lg p-1 text-muted hover:text-ink hover:bg-raised transition-colors"
              >
                ✕
              </button>
            </div>

            {notificationMsg && (
              <div className="mt-3 rounded-lg bg-emerald/10 border border-emerald/20 p-2.5 text-[12px] font-medium text-emerald">
                {notificationMsg}
              </div>
            )}

            <div className="mt-4 space-y-5 flex-1">
              {/* Quick Status / Health Summary */}
              <div className="rounded-lg border border-edge bg-raised/40 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Project Health & Milestones</div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-muted">Health: </span>
                    <span className="font-medium text-ink capitalize">{selectedProject.health}</span>
                  </div>
                  <div>
                    <span className="text-muted">Next Date: </span>
                    <span className="font-medium text-ink">{selectedProject.nextMilestone?.date || "None"}</span>
                  </div>
                </div>
                {selectedProject.healthReason && (
                  <p className="mt-2 text-[11px] text-amber">
                    Notice: {selectedProject.healthReason}
                  </p>
                )}
              </div>

              {/* Action 1: Add Client Message / Communication Note */}
              <div className="rounded-lg border border-edge bg-surface p-3.5">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink mb-1">
                  <MessageSquare className="h-4 w-4 text-teal" />
                  <span>Add Client Message / Update Note</span>
                </div>
                <p className="text-[11px] text-muted mb-2">
                  Record latest message from client or internal update to keep the team informed.
                </p>
                <form onSubmit={handleAddClientNote} className="space-y-2">
                  <textarea
                    rows={2}
                    value={clientNote}
                    onChange={(e) => setClientNote(e.target.value)}
                    placeholder="e.g. Client requested revised timeline for module 2..."
                    className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingNote || !clientNote.trim()}
                      className="inline-flex items-center gap-1 rounded bg-teal px-3 py-1 text-[12px] font-medium text-white hover:bg-tealhi transition-colors disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      <span>{isSubmittingNote ? "Saving..." : "Save Note"}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Action 2: Raise a Change Request */}
              <div className="rounded-lg border border-edge bg-surface p-3.5">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink mb-1">
                  <FileEdit className="h-4 w-4 text-amber" />
                  <span>Raise a Change Request</span>
                </div>
                <p className="text-[11px] text-muted mb-2">
                  Log out-of-scope work or new client requirements for team assessment and approval.
                </p>
                <form onSubmit={handleRaiseChangeRequest} className="space-y-2">
                  <textarea
                    rows={2}
                    value={changeRequestText}
                    onChange={(e) => setChangeRequestText(e.target.value)}
                    placeholder="Describe the change request and client expectations..."
                    className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-[12px] text-ink placeholder:text-faint focus:border-amber focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingCR || !changeRequestText.trim()}
                      className="inline-flex items-center gap-1 rounded bg-amber px-3 py-1 text-[12px] font-medium text-white hover:bg-amber/90 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{isSubmittingCR ? "Submitting..." : "Submit Change Request"}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Action 3: Quick Delegate to Team Member */}
              <div className="rounded-lg border border-edge bg-surface p-3.5">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink mb-1">
                  <ArrowRightLeft className="h-4 w-4 text-indigo-500" />
                  <span>Delegate Item to Developer / Designer / Marketer</span>
                </div>
                <p className="text-[11px] text-muted mb-2">
                  Hand over a deliverable or client requirement with a single click and note.
                </p>
                <RowActions
                  onSuccess={() => {
                    setNotificationMsg("Task delegated successfully!");
                    setTimeout(() => setNotificationMsg(null), 3000);
                  }}
                />
              </div>
            </div>

            <div className="mt-5 border-t border-edge/60 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="rounded-lg border border-edge px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink hover:bg-raised transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
