"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Globe,
  Layers,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  XCircle,
  RotateCcw,
  ShieldAlert,
  Building
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { HelperText } from "./HelperText";
import { TargetBar } from "./TargetBar";
import { RowActions } from "./RowActions";

export interface FounderDecisionItem {
  id: string;
  type: "discount" | "high_value_proposal" | "hiring" | "refund" | "client_escalation";
  title: string;
  requesterName: string;
  department: string;
  details: string;
  financialImpact?: string;
  date: string;
  status: "pending" | "approved" | "rejected" | "sent_back";
}

export interface DepartmentPulseItem {
  department: "Sales" | "Delivery" | "Marketing" | "SEO" | "HR";
  status: "green" | "amber" | "red";
  reason: string;
  metricHighlight: string;
  leadPerson: string;
}

export interface OwnContactDeal {
  id: string;
  name: string;
  company: string;
  dealValue: string;
  stage: string;
  lastCallDate: string;
  needsHandoverToCloser: boolean;
}

export interface SeoRankingMovement {
  id: string;
  clientName: string;
  domain: string;
  keyword: string;
  previousPosition: number;
  currentPosition: number;
  change: number; // positive = improved, negative = dropped
  clicksWeekly: number;
}

interface FounderDashboardProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  decisions: FounderDecisionItem[];
  departmentPulses: DepartmentPulseItem[];
  ownContactDeals: OwnContactDeal[];
  seoMovements: SeoRankingMovement[];
  stats: {
    monthlySales: number; // in Lakhs
    salesTarget: number; // 25 Lakhs
    cashExpectedThisWeek: string;
    projectsAtRiskCount: number;
    pendingApprovalsCount: number;
  };
}

export function FounderDashboard({
  user,
  needsMeNowItems,
  decisions: initialDecisions,
  departmentPulses,
  ownContactDeals: initialOwnDeals,
  seoMovements,
  stats,
}: FounderDashboardProps) {
  const [decisions, setDecisions] = useState<FounderDecisionItem[]>(initialDecisions);
  const [ownDeals, setOwnDeals] = useState<OwnContactDeal[]>(initialOwnDeals);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const handleDecisionAction = async (id: string, action: "approved" | "rejected" | "sent_back") => {
    await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action }),
    }).catch(() => null);

    setDecisions((prev) => prev.map((d) => (d.id === id ? { ...d, status: action } : d)));
    setActionSuccessMsg(`Decision marked as ${action.replace("_", " ")}`);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const handleHandoverToCloser = async (dealId: string) => {
    await fetch(`/api/crm/leads/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedTo: "Sage",
        stage: "NEGOTIATING",
        notes: "Handed over by Alex after initial founder call.",
      }),
    }).catch(() => null);

    setOwnDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, needsHandoverToCloser: false, stage: "Handed to Sage" } : d))
    );
    setActionSuccessMsg("Deal handed over to Sage (Closer) successfully!");
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const getStatusDot = (status: "green" | "amber" | "red") => {
    switch (status) {
      case "green":
        return <span className="h-2.5 w-2.5 rounded-full bg-emerald shadow-[0_0_8px_rgba(16,185,129,0.4)]" />;
      case "amber":
        return <span className="h-2.5 w-2.5 rounded-full bg-amber shadow-[0_0_8px_rgba(245,158,11,0.4)]" />;
      case "red":
        return <span className="h-2.5 w-2.5 rounded-full bg-rose shadow-[0_0_8px_rgba(244,63,94,0.4)]" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Founder & CEO Dashboard
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Executive company overview, key founder decisions, department pulse, and high-level SEO health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised transition-colors shadow-sm"
          >
            <TrendingUp className="h-3.5 w-3.5 text-muted" />
            <span>Full Company Analytics</span>
          </Link>
        </div>
      </div>

      {/* Target & Financial Pulse Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <TargetBar
          label="This Month's Sales"
          helper="Closed revenue vs. monthly target"
          tooltip="Overall company booked and invoiced revenue"
          current={stats.monthlySales}
          target={stats.salesTarget}
          unit=" Lakh"
        />

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Cash Expected This Week</div>
            <HelperText text="Invoices due & milestone payments" />
          </div>
          <div className="text-[20px] font-semibold text-emerald mt-1">
            {stats.cashExpectedThisWeek || "₹6.4 Lakh"}
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Projects at Risk</div>
            <HelperText text="Delivery delays or escalated client tickets" />
          </div>
          <div className={`text-[20px] font-semibold mt-1 ${stats.projectsAtRiskCount > 0 ? "text-rose" : "text-emerald"}`}>
            {stats.projectsAtRiskCount} {stats.projectsAtRiskCount === 1 ? "project" : "projects"}
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Decisions Waiting</div>
            <HelperText text="Discounts, refunds & hiring approvals" />
          </div>
          <div className="text-[20px] font-semibold text-amber mt-1">
            {stats.pendingApprovalsCount} pending
          </div>
        </div>
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Founder sign-offs, high-value client escalations, and decisions blocking the team"
        emptyMessage="No pending founder escalations. Everything running smoothly."
      />

      {actionSuccessMsg && (
        <div className="rounded-lg bg-emerald/10 border border-emerald/20 p-2.5 text-[12px] font-medium text-emerald">
          {actionSuccessMsg}
        </div>
      )}

      {/* 2. Decisions Waiting for Alex */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber" />
            <h2 className="text-[15px] font-semibold text-ink">Decisions Waiting for Approval</h2>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
              {decisions.filter((d) => d.status === "pending").length}
            </span>
          </div>
          <HelperText text="1-click Approve, Reject or Send back with notes" />
        </div>

        <div className="divide-y divide-edge/50">
          {decisions.filter((d) => d.status === "pending").length === 0 ? (
            <div className="py-8 text-center text-[12px] text-muted">
              No approvals waiting for founder sign-off.
            </div>
          ) : (
            decisions
              .filter((d) => d.status === "pending")
              .map((item) => (
                <div key={item.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[14px] text-ink">{item.title}</span>
                      <span className="rounded bg-raised border border-edge px-2 py-0.5 text-[10px] font-medium text-muted">
                        {item.department} · by {item.requesterName}
                      </span>
                      {item.financialImpact && (
                        <span className="text-[11px] font-semibold text-amber">
                          Impact: {item.financialImpact}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted leading-relaxed">{item.details}</p>
                  </div>

                  {/* Decision Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto">
                    <button
                      type="button"
                      onClick={() => handleDecisionAction(item.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald/90 transition-colors"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecisionAction(item.id, "sent_back")}
                      className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                    >
                      <RotateCcw className="h-3 w-3 text-muted" />
                      <span>Send Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecisionAction(item.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-md border border-rose/20 bg-rose/5 px-2.5 py-1 text-[11px] font-medium text-rose hover:bg-rose/10 transition-colors"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* 3. Department Pulse & Stepping Back from Selling */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Department Pulse (1 line per department) */}
        <div className="lg:col-span-6 rounded-xl border border-edge bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-teal" />
                <h3 className="text-[14px] font-semibold text-ink">Department Pulse</h3>
              </div>
              <HelperText text="Real-time operational status across all units" />
            </div>

            <div className="space-y-3">
              {departmentPulses.map((dp) => (
                <div
                  key={dp.department}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-edge/60 bg-raised/30"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {getStatusDot(dp.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-ink">{dp.department}</span>
                        <span className="text-[11px] text-muted">({dp.leadPerson})</span>
                      </div>
                      <p className="text-[11px] text-muted truncate">{dp.reason}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-ink bg-surface border border-edge px-2 py-0.5 rounded shrink-0">
                    {dp.metricHighlight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Stepping Back from Selling (Own-Contact Pipeline) */}
        <div className="lg:col-span-6 rounded-xl border border-edge bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-teal" />
                <h3 className="text-[14px] font-semibold text-ink">Own-Contact Pipeline</h3>
              </div>
              <HelperText text="Nudge to hand off to closer (Sage) once 1st call is done" />
            </div>

            <div className="space-y-2.5">
              {ownDeals.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-muted">
                  No personal founder deals pending handover.
                </div>
              ) : (
                ownDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-3 rounded-lg border border-edge bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-ink">{deal.company}</span>
                        <span className="text-[11px] font-semibold text-emerald">{deal.dealValue}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        Contact: {deal.name} · Stage: {deal.stage}
                      </div>
                    </div>

                    {deal.needsHandoverToCloser ? (
                      <button
                        type="button"
                        onClick={() => handleHandoverToCloser(deal.id)}
                        className="inline-flex items-center gap-1 rounded bg-teal px-2.5 py-1 text-[11px] font-medium text-white hover:bg-tealhi transition-colors shrink-0"
                      >
                        <ArrowRight className="h-3 w-3" />
                        <span>Hand to Sage</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted font-medium bg-raised px-2 py-0.5 rounded shrink-0">
                        Handed over ✓
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. SEO Corner: Ranking Movements (5-minute review) */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-teal" />
            <h2 className="text-[15px] font-semibold text-ink">SEO Corner (Client Ranking Movements)</h2>
          </div>
          <HelperText text="Search Console live sync — key movements for 5-minute review" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {seoMovements.map((item) => {
            const isPositive = item.change > 0;
            return (
              <div key={item.id} className="rounded-lg border border-edge bg-raised/20 p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[13px] text-ink">{item.clientName}</span>
                    <span className="text-[10px] text-muted">{item.domain}</span>
                  </div>
                  <p className="text-[12px] font-medium text-teal mt-1">"{item.keyword}"</p>
                </div>

                <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {isPositive ? (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-rose" />
                    )}
                    <span className={isPositive ? "text-emerald font-semibold" : "text-rose font-semibold"}>
                      Pos {item.currentPosition} ({isPositive ? `+${item.change}` : item.change})
                    </span>
                  </div>
                  <span className="text-muted">{item.clicksWeekly} clicks/wk</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
