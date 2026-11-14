"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  HelpCircle,
  Layers,
  MessageSquare,
  PhoneCall,
  Send,
  Sparkles,
  TrendingUp,
  UserCheck,
  XCircle,
  DollarSign,
  ShieldAlert,
  ClipboardList
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "../shared/NeedsMeNow";
import { HelperText } from "../shared/HelperText";
import { TargetBar } from "../shared/TargetBar";
import { RowActions } from "../shared/RowActions";

export interface ChasingItem {
  id: string;
  title: string;
  department: string;
  assignedToName: string;
  dueDate: string;
  daysLate: number;
  lastUpdateSnippet: string;
}

export interface ClientHealthItem {
  id: string;
  clientName: string;
  company: string;
  accountManager: string;
  lastContactDate: string;
  openIssuesCount: number;
  renewalDate: string;
  health: "green" | "amber" | "red";
  notes?: string;
}

export interface PendingInvoiceItem {
  id: string;
  clientName: string;
  amount: string;
  milestoneTitle: string;
  status: "not_raised" | "sent_unpaid" | "client_signoff_waiting";
  dueDate: string;
}

export interface BlockedEscalationItem {
  id: string;
  title: string;
  flaggedByName: string;
  department: string;
  waitingOn: string;
  daysBlocked: number;
  severity: "high" | "medium";
}

export interface WeeklyProcessCheck {
  id: string;
  title: string;
  category: "compliance" | "processes" | "vendors";
  isAutoCompleted: boolean;
  completedAt?: string;
}

interface ChiefOfStaffDashboardProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  chasingItems: ChasingItem[];
  clientHealthList: ClientHealthItem[];
  pendingInvoices: PendingInvoiceItem[];
  escalations: BlockedEscalationItem[];
  weeklyChecks: WeeklyProcessCheck[];
  stats: {
    chasingCount: number;
    decisionsPreparingCount: number;
    overdueClientFollowupsCount: number;
    clientsWaitingReplyCount: number;
  };
  briefing: {
    date: string;
    meetingsToday: string[];
    decisionsWaiting: string[];
    projectsAtRisk: string[];
    moneyExpectedThisWeek: string;
  };
}

export function ChiefOfStaffDashboard({
  user,
  needsMeNowItems,
  chasingItems: initialChasing,
  clientHealthList,
  pendingInvoices,
  escalations: initialEscalations,
  weeklyChecks: initialChecks,
  stats,
  briefing,
}: ChiefOfStaffDashboardProps) {
  const [chasing, setChasing] = useState<ChasingItem[]>(initialChasing);
  const [escalations, setEscalations] = useState<BlockedEscalationItem[]>(initialEscalations);
  const [weeklyChecks, setWeeklyChecks] = useState<WeeklyProcessCheck[]>(initialChecks);
  const [activeTab, setActiveTab] = useState<"chasing" | "briefing" | "clients" | "invoices" | "escalations" | "weekly">("chasing");
  const [customBriefingNote, setCustomBriefingNote] = useState("");
  const [briefingSent, setBriefingSent] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null);

  const handleNudge = (person: string, title: string) => {
    setNudgeMsg(`🔔 Nudge sent to ${person} for: "${title}"`);
    setTimeout(() => setNudgeMsg(null), 3000);
  };

  const handleSendBriefingToLav = async () => {
    setBriefingSent(true);
    await fetch("/api/notifications/founder-briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: briefing.date,
        customNote: customBriefingNote,
      }),
    }).catch(() => null);

    setNudgeMsg("Founder Briefing dispatched to Alex's dashboard & Slack!");
    setTimeout(() => setNudgeMsg(null), 3500);
  };

  const handleToggleWeeklyCheck = (id: string) => {
    setWeeklyChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isAutoCompleted: !c.isAutoCompleted } : c))
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Chief of Staff Desk
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Cross-functional chasing, automated Founder morning briefings, client health, and executive escalations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("briefing")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal/30 bg-teal/10 px-3 py-1.5 text-[12px] font-medium text-teal hover:bg-teal/20 transition-colors shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Open Today's Founder Briefing</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Items Being Chased</div>
            <HelperText text="Deliverables requested across departments" />
          </div>
          <div className="text-[20px] font-semibold text-amber mt-1">
            {stats.chasingCount} items
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Decisions for Alex</div>
            <HelperText text="Approvals & reviews being prepared" />
          </div>
          <div className="text-[20px] font-semibold text-teal mt-1">
            {stats.decisionsPreparingCount} ready
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Overdue Promised Follow-ups</div>
            <HelperText text="Commitments to clients/partners past date" />
          </div>
          <div className={`text-[20px] font-semibold mt-1 ${stats.overdueClientFollowupsCount > 0 ? "text-rose" : "text-emerald"}`}>
            {stats.overdueClientFollowupsCount} overdue
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Clients Waiting For Reply</div>
            <HelperText text="Client queries unanswered > 4 hours" />
          </div>
          <div className={`text-[20px] font-semibold mt-1 ${stats.clientsWaitingReplyCount > 0 ? "text-rose" : "text-emerald"}`}>
            {stats.clientsWaitingReplyCount} clients
          </div>
        </div>
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Executive escalations, founder briefing sign-off, and urgent client follow-ups"
        emptyMessage="No pending items requiring immediate Chief of Staff triage."
      />

      {nudgeMsg && (
        <div className="rounded-lg bg-emerald/10 border border-emerald/20 p-2.5 text-[12px] font-medium text-emerald flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span>{nudgeMsg}</span>
        </div>
      )}

      {/* 2. Main Executive Desk Panel */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab("chasing")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "chasing"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Chasing List ({chasing.length})
            </button>
            <button
              onClick={() => setActiveTab("briefing")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "briefing"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Founder Briefing
            </button>
            <button
              onClick={() => setActiveTab("clients")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "clients"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Client Health ({clientHealthList.length})
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "invoices"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Approvals & Invoices ({pendingInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab("escalations")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "escalations"
                  ? "bg-rose/10 text-rose border border-rose/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Blocked Escalations ({escalations.length})
            </button>
            <button
              onClick={() => setActiveTab("weekly")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "weekly"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Weekly Checks ({weeklyChecks.filter((c) => c.isAutoCompleted).length}/{weeklyChecks.length})
            </button>
          </div>

          <HelperText text="Chief of Staff orchestrator" />
        </div>

        {/* Tab 1: Chasing List */}
        {activeTab === "chasing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                Cross-Department Deliverables Being Chased
              </div>
              <HelperText text="Single-click Nudge or Reassign overdue action items" />
            </div>

            <div className="divide-y divide-edge/50">
              {chasing.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-muted">
                  No overdue items currently being chased.
                </div>
              ) : (
                chasing.map((item) => (
                  <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14px] text-ink">{item.title}</span>
                        <span className="rounded bg-raised border border-edge px-2 py-0.5 text-[10px] font-medium text-muted">
                          {item.department}
                        </span>
                        {item.daysLate > 0 && (
                          <span className="rounded bg-rose/10 text-rose border border-rose/20 px-2 py-0.5 text-[10px] font-semibold">
                            {item.daysLate} days late
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted">
                        Assigned to: <span className="font-medium text-ink">{item.assignedToName}</span> · Due: {item.dueDate}
                      </div>
                      <p className="text-[11px] text-muted italic bg-raised/40 p-1.5 rounded border border-edge/40">
                        Status: "{item.lastUpdateSnippet}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleNudge(item.assignedToName, item.title)}
                        className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                      >
                        <Bell className="h-3 w-3 text-amber" />
                        <span>Nudge</span>
                      </button>
                      <RowActions
                        taskId={item.id}
                        onSuccess={() => {
                          setChasing((prev) => prev.filter((i) => i.id !== item.id));
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Founder Briefing */}
        {activeTab === "briefing" && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between border-b border-edge/60 pb-3">
              <div>
                <h3 className="text-[16px] font-semibold text-ink">
                  Founder Daily Briefing — {briefing.date}
                </h3>
                <p className="text-[12px] text-muted">
                  Auto-compiled each morning. Review, append executive notes, and dispatch to Alex.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendBriefingToLav}
                disabled={briefingSent}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-tealhi transition-colors shadow-sm disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{briefingSent ? "Briefing Dispatched ✓" : "Send to Alex"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-edge bg-raised/30 p-3.5 space-y-2">
                <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                  <PhoneCall className="h-3.5 w-3.5 text-teal" />
                  <span>Key Meetings Today</span>
                </div>
                <ul className="text-[12px] text-muted space-y-1 list-disc list-inside">
                  {briefing.meetingsToday.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-edge bg-raised/30 p-3.5 space-y-2">
                <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber" />
                  <span>Decisions Waiting Sign-off</span>
                </div>
                <ul className="text-[12px] text-muted space-y-1 list-disc list-inside">
                  {briefing.decisionsWaiting.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-edge bg-raised/30 p-3.5 space-y-2">
                <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                  <AlertOctagon className="h-3.5 w-3.5 text-rose" />
                  <span>Projects at Risk</span>
                </div>
                <ul className="text-[12px] text-muted space-y-1 list-disc list-inside">
                  {briefing.projectsAtRisk.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-edge bg-raised/30 p-3.5 space-y-2">
                <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-emerald" />
                  <span>Cash Inflow Expected This Week</span>
                </div>
                <div className="text-[18px] font-semibold text-emerald">
                  {briefing.moneyExpectedThisWeek}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">
                Kit's Executive Note for Alex (Optional)
              </label>
              <textarea
                rows={3}
                value={customBriefingNote}
                onChange={(e) => setCustomBriefingNote(e.target.value)}
                placeholder="Add any specific context or items requiring Alex's personal touch today..."
                className="w-full rounded border border-edge bg-surface px-3 py-2 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Tab 3: Client Health List */}
        {activeTab === "clients" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                Active Client Health & Renewal Radar
              </div>
              <HelperText text="Sorted by accounts needing attention first" />
            </div>

            <div className="divide-y divide-edge/50">
              {clientHealthList.map((c) => (
                <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      c.health === "green"
                        ? "bg-emerald shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                        : c.health === "amber"
                        ? "bg-amber shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                        : "bg-rose shadow-[0_0_6px_rgba(244,63,94,0.5)]"
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-ink">{c.company}</span>
                        <span className="text-[11px] text-muted">({c.clientName})</span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        AM: {c.accountManager} · Last contact: {c.lastContactDate} · Renewal: {c.renewalDate}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[12px]">
                    <span className={`font-medium ${c.openIssuesCount > 0 ? "text-amber" : "text-muted"}`}>
                      {c.openIssuesCount} open issues
                    </span>
                    <button
                      type="button"
                      className="rounded border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                    >
                      View Account
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Approvals & Invoices */}
        {activeTab === "invoices" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                Milestones Waiting Sign-off & Invoices Unpaid
              </div>
              <HelperText text="Deliverables pending client approval and revenue collection" />
            </div>

            <div className="divide-y divide-edge/50">
              {pendingInvoices.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between text-[13px]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{inv.clientName}</span>
                      <span className="text-[11px] text-muted">· {inv.milestoneTitle}</span>
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      Due: {inv.dueDate}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-emerald text-[13px]">{inv.amount}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      inv.status === "not_raised"
                        ? "bg-amber/10 text-amber border-amber/20"
                        : inv.status === "sent_unpaid"
                        ? "bg-rose/10 text-rose border-rose/20"
                        : "bg-teal/10 text-teal border-teal/20"
                    }`}>
                      {inv.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Blocked Escalations */}
        {activeTab === "escalations" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                Team Escalations & Dependency Blocks
              </div>
              <HelperText text="Clear directly or escalate to Alex / Jordan" />
            </div>

            <div className="divide-y divide-edge/50">
              {escalations.map((esc) => (
                <div key={esc.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] text-ink">{esc.title}</span>
                      <span className="rounded bg-rose/10 text-rose border border-rose/20 px-2 py-0.5 text-[10px] font-semibold">
                        Blocked {esc.daysBlocked}d
                      </span>
                    </div>
                    <div className="text-[12px] text-muted mt-1">
                      Flagged by <span className="font-medium text-ink">{esc.flaggedByName}</span> ({esc.department}) · Waiting on: <span className="font-semibold text-amber">{esc.waitingOn}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleNudge(esc.waitingOn, esc.title)}
                      className="rounded border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                    >
                      Clear Blocker
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 6: Weekly Checks */}
        {activeTab === "weekly" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Weekly Operational & Process Checklist
                </div>
                <HelperText text="Auto-ticks when matching events occur, or manually complete" />
              </div>
            </div>

            <div className="divide-y divide-edge/50">
              {weeklyChecks.map((chk) => (
                <div key={chk.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleWeeklyCheck(chk.id)}
                      className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                        chk.isAutoCompleted
                          ? "bg-teal border-teal text-white"
                          : "border-edge bg-surface"
                      }`}
                    >
                      {chk.isAutoCompleted && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                    <span className={`text-[13px] ${chk.isAutoCompleted ? "line-through text-muted" : "text-ink font-medium"}`}>
                      {chk.title}
                    </span>
                  </div>

                  <span className="text-[10px] uppercase font-semibold text-muted bg-raised px-2 py-0.5 rounded">
                    {chk.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
