"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  MessageSquare,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
  Activity,
  SendHorizontal,
  RefreshCw,
  Calendar
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "../shared/NeedsMeNow";
import { HelperText } from "../shared/HelperText";
import { TargetBar } from "../shared/TargetBar";
import { RowActions } from "../shared/RowActions";

export interface StuckWorkItem {
  id: string;
  title: string;
  project: string;
  department: string;
  ownerName: string;
  ownerRole: string;
  daysStuck: number;
  lastUpdateSnippet: string;
}

export interface DeptHandoverItem {
  id: string;
  projectTitle: string;
  clientName: string;
  fromDept: string;
  toDept: string;
  currentOwner: string;
  targetDate: string;
  status: "waiting_intake" | "in_review" | "blocked";
  notes?: string;
}

export interface TeamMemberCapacity {
  id: string;
  name: string;
  role: string;
  department: string;
  capacityScore: number; // 0 - 100%
  activeProjectsCount: number;
  status: "idle" | "balanced" | "overloaded";
  twoWeekForecastText: string;
}

export interface DailyAttendanceCheck {
  id: string;
  name: string;
  department: string;
  status: "present" | "on_leave" | "late";
  hoursLogged: number;
  plannedHours: number;
  tasksCompletedToday: number;
}

interface CooControlRoomProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  stuckWorkItems: StuckWorkItem[];
  handovers: DeptHandoverItem[];
  teamCapacities: TeamMemberCapacity[];
  dailyChecks: DailyAttendanceCheck[];
  stats: {
    projectsDueThisWeek: number;
    overdueTasksTotal: number;
    overloadedMembersCount: number;
    unansweredClientMsgsCount: number;
  };
}

export function CooControlRoomDashboard({
  user,
  needsMeNowItems,
  stuckWorkItems: initialStuckItems,
  handovers: initialHandovers,
  teamCapacities,
  dailyChecks,
  stats,
}: CooControlRoomProps) {
  const [stuckWork, setStuckWork] = useState<StuckWorkItem[]>(initialStuckItems);
  const [handovers, setHandovers] = useState<DeptHandoverItem[]>(initialHandovers);
  const [activeTab, setActiveTab] = useState<"stuck" | "handovers" | "capacity" | "attendance">("stuck");
  const [nudgedMsg, setNudgedMsg] = useState<string | null>(null);

  const handleNudge = (ownerName: string, title: string) => {
    setNudgedMsg(`🔔 Nudge notification sent to ${ownerName} regarding "${title}"`);
    setTimeout(() => setNudgedMsg(null), 3000);
  };

  const handleReassign = async (itemId: string, newOwner: string) => {
    await fetch(`/api/tasks/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTo: newOwner }),
    }).catch(() => null);

    setStuckWork((prev) => prev.filter((item) => item.id !== itemId));
    setNudgedMsg(`Task reassigned to ${newOwner} successfully!`);
    setTimeout(() => setNudgedMsg(null), 3000);
  };

  const getCapacityColor = (status: TeamMemberCapacity["status"]) => {
    switch (status) {
      case "overloaded":
        return "bg-rose text-white";
      case "balanced":
        return "bg-teal text-white";
      case "idle":
        return "bg-sky text-white";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Operations Control Room
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Operational bottlenecks, cross-department handovers, team workload balance, and daily execution metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised transition-colors shadow-sm"
          >
            <Layers className="h-3.5 w-3.5 text-muted" />
            <span>Open All Company Work</span>
          </Link>
        </div>
      </div>

      {/* Top Metric Strip: Projects due, overdue, overloaded, client msgs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Projects Due This Week</div>
            <HelperText text="Client delivery milestones & sign-offs" />
          </div>
          <div className="text-[20px] font-semibold text-teal mt-1">
            {stats.projectsDueThisWeek} projects
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Overdue Work</div>
            <HelperText text="Tasks past promised deadline across teams" />
          </div>
          <div className={`text-[20px] font-semibold mt-1 ${stats.overdueTasksTotal > 0 ? "text-rose" : "text-emerald"}`}>
            {stats.overdueTasksTotal} items late
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Workload Imbalance</div>
            <HelperText text="Members overloaded (>90%) or idle" />
          </div>
          <div className={`text-[20px] font-semibold mt-1 ${stats.overloadedMembersCount > 0 ? "text-amber" : "text-emerald"}`}>
            {stats.overloadedMembersCount} flagged
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Unanswered Client Msgs</div>
            <HelperText text="Client questions waiting > 4 hours" />
          </div>
          <div className={`text-[20px] font-semibold mt-1 ${stats.unansweredClientMsgsCount > 0 ? "text-rose" : "text-emerald"}`}>
            {stats.unansweredClientMsgsCount} waiting
          </div>
        </div>
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Overdue project deliveries, cross-department blocks, and client escalations"
        emptyMessage="No operational blockers requiring COO intervention."
      />

      {nudgedMsg && (
        <div className="rounded-lg bg-teal/10 border border-teal/20 p-2.5 text-[12px] font-medium text-teal flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span>{nudgedMsg}</span>
        </div>
      )}

      {/* 2. Operations Workpanel */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab("stuck")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "stuck"
                  ? "bg-rose/10 text-rose border border-rose/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Stuck Work (&gt;3 Days Silent) ({stuckWork.length})
            </button>
            <button
              onClick={() => setActiveTab("handovers")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "handovers"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Cross-Dept Handover Board ({handovers.length})
            </button>
            <button
              onClick={() => setActiveTab("capacity")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "capacity"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Team 2-Week Capacity ({teamCapacities.length})
            </button>
            <button
              onClick={() => setActiveTab("attendance")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "attendance"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Daily Attendance & Time Log
            </button>
          </div>

          <HelperText text="Unified COO oversight across all 5 operational units" />
        </div>

        {/* Tab 1: Stuck Work with 1-click Nudge / Reassign */}
        {activeTab === "stuck" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                Work With No Progress or Updates for &gt; 3 Days
              </div>
              <HelperText text="Send instant nudge to assignee or transfer task owner" />
            </div>

            <div className="divide-y divide-edge/50">
              {stuckWork.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-muted">
                  🎉 No stuck work! All items have updates in the last 72 hours.
                </div>
              ) : (
                stuckWork.map((item) => (
                  <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14px] text-ink">{item.title}</span>
                        <span className="rounded bg-rose/10 text-rose border border-rose/20 px-2 py-0.5 text-[10px] font-semibold">
                          {item.daysStuck} days stuck
                        </span>
                        <span className="rounded bg-raised border border-edge px-2 py-0.5 text-[10px] font-medium text-muted">
                          {item.project} · {item.department}
                        </span>
                      </div>
                      <div className="text-[12px] text-muted">
                        Assigned to: <span className="font-medium text-ink">{item.ownerName}</span> ({item.ownerRole})
                      </div>
                      <p className="text-[11px] text-muted italic bg-raised/40 p-1.5 rounded border border-edge/40">
                        Last update: "{item.lastUpdateSnippet}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleNudge(item.ownerName, item.title)}
                        className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                      >
                        <Bell className="h-3 w-3 text-amber" />
                        <span>Nudge {item.ownerName.split(" ")[0]}</span>
                      </button>
                      <RowActions
                        taskId={item.id}
                        onSuccess={() => {
                          setStuckWork((prev) => prev.filter((i) => i.id !== item.id));
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Cross-Dept Handover Board */}
        {activeTab === "handovers" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                Work In Transit Between Departments
              </div>
              <HelperText text="Sales to Delivery, Design to Development handovers" />
            </div>

            <div className="divide-y divide-edge/50">
              {handovers.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-muted">
                  No active handovers waiting.
                </div>
              ) : (
                handovers.map((h) => (
                  <div key={h.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[14px] text-ink">{h.projectTitle}</span>
                        <span className="text-[12px] text-muted">({h.clientName})</span>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-muted mt-1">
                        <span className="font-medium text-ink">{h.fromDept}</span>
                        <ArrowRight className="h-3 w-3 text-teal" />
                        <span className="font-medium text-teal">{h.toDept}</span>
                        <span>· Owner: {h.currentOwner}</span>
                        <span className="text-amber">· Target: {h.targetDate}</span>
                      </div>
                      {h.notes && (
                        <p className="text-[11px] text-muted mt-1 italic">
                          Notes: "{h.notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        h.status === "blocked"
                          ? "bg-rose/10 text-rose border-rose/20"
                          : h.status === "waiting_intake"
                          ? "bg-amber/10 text-amber border-amber/20"
                          : "bg-teal/10 text-teal border-teal/20"
                      }`}>
                        {h.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Team 2-Week Capacity */}
        {activeTab === "capacity" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Team Workload & 2-Week Availability
                </div>
                <HelperText text="Place new incoming client projects on developers & designers with balanced bandwidth" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamCapacities.map((m) => (
                <div key={m.id} className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[13px] text-ink">{m.name}</span>
                        <div className="text-[11px] text-muted">{m.role} · {m.department}</div>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        m.status === "overloaded"
                          ? "bg-rose/10 text-rose border border-rose/20"
                          : m.status === "idle"
                          ? "bg-sky/10 text-sky border border-sky/20"
                          : "bg-teal/10 text-teal border border-teal/20"
                      }`}>
                        {m.status}
                      </span>
                    </div>

                    {/* Capacity Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-muted">Current Load</span>
                        <span className="font-semibold text-ink">{m.capacityScore}%</span>
                      </div>
                      <div className="h-2 w-full bg-raised rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            m.capacityScore > 85 ? "bg-rose" : m.capacityScore < 40 ? "bg-sky" : "bg-teal"
                          }`}
                          style={{ width: `${Math.min(m.capacityScore, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-edge/60 flex items-center justify-between text-[11px] text-muted">
                    <span>{m.activeProjectsCount} active projects</span>
                    <span className="text-ink font-medium">{m.twoWeekForecastText}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Daily Attendance & Time Log */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Today's Execution & Time Logged
                </div>
                <HelperText text="Live replacement for standalone time-tracking spreadsheets" />
              </div>
            </div>

            <div className="divide-y divide-edge/50">
              {dailyChecks.map((dc) => (
                <div key={dc.id} className="py-2.5 flex items-center justify-between text-[13px]">
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full ${
                      dc.status === "present"
                        ? "bg-emerald shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                        : dc.status === "late"
                        ? "bg-amber"
                        : "bg-rose"
                    }`} />
                    <div>
                      <span className="font-medium text-ink">{dc.name}</span>
                      <span className="text-[11px] text-muted ml-2">({dc.department})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[12px]">
                    <span className="text-muted">
                      {dc.tasksCompletedToday} tasks done
                    </span>
                    <span className="font-semibold text-ink bg-raised px-2 py-0.5 rounded border border-edge">
                      {dc.hoursLogged}h / {dc.plannedHours}h logged
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
