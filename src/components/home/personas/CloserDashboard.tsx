"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  HelpCircle,
  Layers,
  MessageSquare,
  PhoneCall,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  XCircle,
  Copy,
  Check
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "../shared/NeedsMeNow";
import { HelperText } from "../shared/HelperText";
import { TargetBar } from "../shared/TargetBar";
import { RowActions } from "../shared/RowActions";

export interface CloserDealItem {
  id: string;
  name: string;
  company: string;
  value: string;
  closingProbability: number; // e.g. 80 for 80%
  expectedCloseDate: string;
  lastClientReplyAgoDays: number;
  lastClientMessageSnippet?: string;
  suggestedFollowUp?: string;
  nextAction: "call" | "revise_quote" | "send_agreement" | "followup";
  requirementsSummary?: string;
  budgetRange?: string;
  status: "open" | "stuck" | "won" | "lost";
}

export interface PastProjectRef {
  id: string;
  title: string;
  category: string;
  scopeSummary: string;
  finalPrice: string;
  deliveryWeeks: number;
}

interface CloserDashboardProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  deals: CloserDealItem[];
  pastProjects?: PastProjectRef[];
  stats: {
    closedValue: number;
    closedTarget: number;
    pipelineValue: string;
    gapToTarget: string;
    closingRatePercent: number;
  };
}

export function CloserDashboard({
  user,
  needsMeNowItems,
  deals: initialDeals,
  pastProjects = [
    {
      id: "p1",
      title: "Real Estate Multi-Portal Web & Mobile",
      category: "Web & Mobile App",
      scopeSummary: "Property listings, agent dashboards, map view, lead CRM sync",
      finalPrice: "₹4.5 Lakh",
      deliveryWeeks: 6,
    },
    {
      id: "p2",
      title: "Custom Shopify Plus Theme & ERP Sync",
      category: "E-Commerce",
      scopeSummary: "Custom checkout flow, SAP inventory sync, high-traffic speed tuning",
      finalPrice: "₹3.2 Lakh",
      deliveryWeeks: 4,
    },
    {
      id: "p3",
      title: "Healthtech Doctor Booking & Telehealth",
      category: "Telehealth App",
      scopeSummary: "Video consultations, HIPAA compliance, prescription generator",
      finalPrice: "₹6.0 Lakh",
      deliveryWeeks: 8,
    },
  ],
  stats,
}: CloserDashboardProps) {
  const [deals, setDeals] = useState<CloserDealItem[]>(initialDeals);
  const [selectedDeal, setSelectedDeal] = useState<CloserDealItem | null>(initialDeals[0] || null);
  const [activeTab, setActiveTab] = useState<"active" | "stuck" | "quote_helper">("active");
  const [isMarkingWon, setIsMarkingWon] = useState(false);
  const [copiedFollowup, setCopiedFollowup] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const stuckDeals = deals.filter((d) => d.lastClientReplyAgoDays >= 5 && d.status !== "won" && d.status !== "lost");
  const activeDeals = deals
    .filter((d) => d.status !== "won" && d.status !== "lost")
    .sort((a, b) => b.closingProbability - a.closingProbability);

  const handleMarkWon = async (deal: CloserDealItem) => {
    setIsMarkingWon(true);
    try {
      // 1. Update lead/deal to WON in CRM
      await fetch(`/api/crm/leads/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "CLOSED_WON",
          status: "won",
        }),
      }).catch(() => null);

      // 2. Automatically spawn Project for Post-Sales handover
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${deal.company} Implementation`,
          clientName: deal.name,
          company: deal.company,
          dealValue: deal.value,
          scopeSummary: deal.requirementsSummary || "Agreed scope attached from closer handover.",
          handoverFrom: "Sage (Closer)",
        }),
      }).catch(() => null);

      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, status: "won" } : d)));
      setSuccessMsg(`🎉 Deal ${deal.company} won! Created project & handed over to Peyton (Post-Sales).`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } finally {
      setIsMarkingWon(false);
    }
  };

  const getActionBadge = (action: CloserDealItem["nextAction"]) => {
    switch (action) {
      case "send_agreement":
        return <span className="rounded bg-emerald/10 text-emerald border border-emerald/20 px-2 py-0.5 text-[10px] font-semibold">Send Agreement</span>;
      case "revise_quote":
        return <span className="rounded bg-sky/10 text-sky border border-sky/20 px-2 py-0.5 text-[10px] font-semibold">Revise Quote</span>;
      case "call":
        return <span className="rounded bg-teal/10 text-teal border border-teal/20 px-2 py-0.5 text-[10px] font-semibold">Closing Call</span>;
      case "followup":
      default:
        return <span className="rounded bg-amber/10 text-amber border border-amber/20 px-2 py-0.5 text-[10px] font-semibold">Follow-up Due</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Deals to Close
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Priority high-probability deals, quote comparison helper, and 1-tap post-sales handover.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/crm"
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised transition-colors shadow-sm"
          >
            <TrendingUp className="h-3.5 w-3.5 text-muted" />
            <span>Open Full CRM</span>
          </Link>
        </div>
      </div>

      {/* Target & Progress Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <TargetBar
          label="Monthly Closed Revenue"
          helper="Won Deals vs Monthly Target"
          tooltip="Closed won contract value this month"
          current={stats.closedValue}
          target={stats.closedTarget}
          unit=" Lakh"
        />

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Closing Pipeline</div>
            <HelperText text="Active deals in proposal & negotiation" />
          </div>
          <div className="text-[20px] font-semibold text-teal mt-1">
            {stats.pipelineValue || "₹14.2 Lakh"}
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Gap to Target</div>
            <HelperText text="Remaining to hit monthly quota" />
          </div>
          <div className="text-[20px] font-semibold text-amber mt-1">
            {stats.gapToTarget || "₹3.8 Lakh"}
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Closing Win Rate</div>
            <HelperText text="Proposal to Won conversion" />
          </div>
          <div className="text-[20px] font-semibold text-emerald mt-1">
            {stats.closingRatePercent || 42}%
          </div>
        </div>
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Client agreements waiting for signing, ready-to-close discovery calls, and overdue followups"
        emptyMessage="No deals stalled or awaiting immediate closing actions."
      />

      {successMsg && (
        <div className="rounded-lg bg-emerald/10 border border-emerald/20 p-3 text-[13px] font-medium text-emerald flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. Main Work Panel */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("active")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "active"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Closing Deals ({activeDeals.length})
            </button>
            <button
              onClick={() => setActiveTab("stuck")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "stuck"
                  ? "bg-amber/10 text-amber border border-amber/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Stuck Deals ({stuckDeals.length})
            </button>
            <button
              onClick={() => setActiveTab("quote_helper")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "quote_helper"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Quote Pricing Helper
            </button>
          </div>

          <HelperText text="Ranked by Closing Probability & Value" />
        </div>

        {/* Tab 1: Active Deals Queue & Closer Card */}
        {activeTab === "active" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[520px]">
            {/* Left Column: Ranked Deals */}
            <div className="lg:col-span-5 border-r border-edge/60 pr-4 space-y-2">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider mb-2">
                Ranked Deals
              </div>
              {activeDeals.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-muted">
                  No active closing deals in pipeline.
                </div>
              ) : (
                activeDeals.map((deal) => (
                  <button
                    key={deal.id}
                    onClick={() => setSelectedDeal(deal)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedDeal?.id === deal.id
                        ? "bg-raised border-teal/40 shadow-xs"
                        : "border-edge/60 hover:bg-raised/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-ink">{deal.company}</span>
                      <span className="text-[12px] font-semibold text-emerald">{deal.value}</span>
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">
                      Contact: <span className="font-medium text-ink">{deal.name}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-teal">
                          {deal.closingProbability}% probability
                        </span>
                        {deal.lastClientReplyAgoDays >= 5 && (
                          <span className="text-[10px] text-amber font-medium">· {deal.lastClientReplyAgoDays}d no reply</span>
                        )}
                      </div>
                      {getActionBadge(deal.nextAction)}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Right Column: Selected Deal Workspace */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              {selectedDeal ? (
                <div className="space-y-4">
                  {/* Deal Header */}
                  <div className="flex items-center justify-between border-b border-edge/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[17px] font-semibold text-ink">{selectedDeal.company}</h3>
                        <span className="text-[13px] font-semibold text-emerald">{selectedDeal.value}</span>
                      </div>
                      <p className="text-[12px] text-muted">Contact: {selectedDeal.name} · Target Close: {selectedDeal.expectedCloseDate}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleMarkWon(selectedDeal)}
                        disabled={isMarkingWon}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald/90 transition-colors shadow-sm disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{isMarkingWon ? "Marking Won..." : "Mark Won 🎉"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Requirements / Scoped Sheet (from Kai / Skyler) */}
                  <div className="rounded-lg border border-edge bg-raised/40 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                      Agreed Requirements & Scope (Handed over from Pre-Sales)
                    </div>
                    <p className="text-[12px] text-ink leading-relaxed">
                      {selectedDeal.requirementsSummary || "Full requirements sheet: Multi-tenant web platform, Stripe recurring billing, React Native mobile apps for clients and service agents."}
                    </p>
                    {selectedDeal.budgetRange && (
                      <div className="mt-2 text-[11px] text-muted">
                        <span className="font-medium text-ink">Budget Range: </span>
                        {selectedDeal.budgetRange}
                      </div>
                    )}
                  </div>

                  {/* Next Step & Quick Actions */}
                  <div className="rounded-lg border border-edge bg-surface p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[12px] font-semibold text-ink">Single Next Action:</div>
                      {getActionBadge(selectedDeal.nextAction)}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <button
                        type="button"
                        className="rounded border border-edge bg-surface hover:bg-raised p-2 text-center text-[11px] font-medium text-ink transition-colors flex items-center justify-center gap-1.5"
                      >
                        <PhoneCall className="h-3.5 w-3.5 text-teal" />
                        <span>Log Call</span>
                      </button>
                      <button
                        type="button"
                        className="rounded border border-edge bg-surface hover:bg-raised p-2 text-center text-[11px] font-medium text-ink transition-colors flex items-center justify-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5 text-sky" />
                        <span>Revise Quote</span>
                      </button>
                      <button
                        type="button"
                        className="rounded border border-edge bg-surface hover:bg-raised p-2 text-center text-[11px] font-medium text-ink transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5 text-emerald" />
                        <span>Send Agreement</span>
                      </button>
                    </div>
                  </div>

                  {/* Standard Row Actions */}
                  <div className="border-t border-edge/60 pt-3 flex items-center justify-between">
                    <RowActions leadId={selectedDeal.id} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Sparkles className="h-8 w-8 text-teal mb-2" />
                  <p className="text-[13px] text-muted">Select a deal on the left to review details and take closing actions.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Stuck Deals with Pre-built Follow-up Templates */}
        {activeTab === "stuck" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Stuck Deals (&gt; 5 Days Without Client Reply)
                </div>
                <HelperText text="Re-ignite interest or discover blockers with tailored revival snippets" />
              </div>
            </div>

            <div className="divide-y divide-edge/50">
              {stuckDeals.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-muted">
                  No stuck deals! All prospects have recent communication.
                </div>
              ) : (
                stuckDeals.map((deal) => (
                  <div key={deal.id} className="py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[14px] text-ink">{deal.company}</span>
                        <span className="text-[12px] text-muted ml-2">({deal.name} · {deal.value})</span>
                      </div>
                      <span className="rounded bg-rose/10 text-rose border border-rose/20 px-2 py-0.5 text-[10px] font-semibold">
                        {deal.lastClientReplyAgoDays} days silent
                      </span>
                    </div>

                    <div className="rounded-lg border border-edge bg-raised/50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                        Suggested Revival Follow-up:
                      </div>
                      <p className="text-[12px] text-ink italic leading-relaxed">
                        "{deal.suggestedFollowUp || `Hi ${deal.name}, circling back on the proposal for ${deal.company}. Did you have any questions on the delivery scope, or should we adjust the phase milestones?`}"
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            deal.suggestedFollowUp || `Hi ${deal.name}, circling back on the proposal for ${deal.company}...`
                          );
                          setCopiedFollowup(true);
                          setTimeout(() => setCopiedFollowup(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                      >
                        {copiedFollowup ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedFollowup ? "Copied" : "Copy Revival Note"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkWon(deal)}
                        className="rounded bg-emerald px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald/90 transition-colors"
                      >
                        Mark Won
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Quote Pricing Helper (Past Projects & Benchmarks) */}
        {activeTab === "quote_helper" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Past Project Benchmarks & Reference Quotes
                </div>
                <HelperText text="Use real delivered scopes & pricing to quickly quote similar deals without underbidding" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pastProjects.map((p) => (
                <div key={p.id} className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-[13px] text-ink">{p.title}</span>
                    </div>
                    <span className="inline-block mt-1 rounded bg-teal/10 text-teal border border-teal/20 px-2 py-0.5 text-[10px] font-medium">
                      {p.category}
                    </span>
                    <p className="text-[12px] text-muted mt-2 leading-relaxed">
                      {p.scopeSummary}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-edge/60 flex items-center justify-between text-[12px]">
                    <span className="text-muted">Delivery: ~{p.deliveryWeeks} weeks</span>
                    <span className="font-semibold text-emerald text-[13px]">{p.finalPrice}</span>
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
