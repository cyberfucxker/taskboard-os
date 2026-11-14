"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Briefcase,
  Calendar,
  Clock,
  Globe,
  Handshake,
  Mail,
  MessageSquare,
  PhoneCall,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  UserCheck,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { HelperText } from "./HelperText";
import { TargetBar } from "./TargetBar";
import { RowActions } from "./RowActions";

export interface BdmLeadItem {
  id: string;
  name: string;
  company: string;
  country?: string;
  timezone?: string; // e.g. "America/New_York", "Europe/London", "Asia/Dubai"
  stage: "NEW" | "TALKING" | "PROPOSAL_SENT" | "NEGOTIATING";
  value?: string;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export interface PartnershipItem {
  id: string;
  partnerName: string;
  type: string; // e.g. "Salesforce Augmentation", "Shopify Plus Agency", "AWS Reseller"
  nextStep: string;
  nextStepDate: string;
  status: "active" | "exploring" | "agreement_pending";
}

interface BdmDashboardProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  leads: BdmLeadItem[];
  partnerships: PartnershipItem[];
  stats: {
    outboundTarget: number;
    outboundDone: number;
    meetingsTarget: number;
    meetingsDone: number;
    pipelineValue: string;
  };
}

export function BdmDashboard({
  user,
  needsMeNowItems,
  leads: initialLeads,
  partnerships: initialPartnerships,
  stats,
}: BdmDashboardProps) {
  const [leads, setLeads] = useState<BdmLeadItem[]>(initialLeads);
  const [partnerships, setPartnerships] = useState<PartnershipItem[]>(initialPartnerships);
  const [activeTab, setActiveTab] = useState<"pipeline" | "partnerships" | "followups">("pipeline");
  const [selectedLead, setSelectedLead] = useState<BdmLeadItem | null>(null);

  // Time formatter for international leads
  const getLocalTime = (tz?: string) => {
    if (!tz) return null;
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).format(new Date());
    } catch {
      return null;
    }
  };

  const columns: { stage: BdmLeadItem["stage"]; label: string; helper: string }[] = [
    { stage: "NEW", label: "New Accounts", helper: "Freshly assigned or identified" },
    { stage: "TALKING", label: "Talking / Discovery", helper: "Initial calls & requirements" },
    { stage: "PROPOSAL_SENT", label: "Proposal Sent", helper: "Scoped quote in client review" },
    { stage: "NEGOTIATING", label: "Negotiating", helper: "Commercials & agreement stage" },
  ];

  const handleStageChange = async (leadId: string, newStage: BdmLeadItem["stage"]) => {
    await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    }).catch(() => null);

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Business Development Pipeline
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Manage key enterprise accounts, international timezones, and strategic vendor partnerships.
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

      {/* Target & Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TargetBar
          label="Outbound Outreach"
          helper="Companies Approached this Week"
          tooltip="Target accounts reached via email, LinkedIn, or cold intro"
          current={stats.outboundDone}
          target={stats.outboundTarget}
          unit=" companies"
        />
        <TargetBar
          label="Meetings Booked"
          helper="Intro & Discovery Calls"
          tooltip="Target qualified sales calls on calendar"
          current={stats.meetingsDone}
          target={stats.meetingsTarget}
          unit=" calls"
        />
        <div className="rounded-lg border border-edge bg-surface p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink">Active Pipeline Value</div>
            <HelperText text="Total value across all talking & negotiating deals" />
          </div>
          <div className="text-[20px] font-semibold text-teal mt-1">
            {stats.pipelineValue || "₹18.5 Lakh"}
          </div>
        </div>
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Priority international calls due today, proposal follow-ups, and partner deliverables"
        emptyMessage="No overdue follow-ups or pending client calls for today."
      />

      {/* 2. Main Panel with Pipeline & Partnerships */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("pipeline")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "pipeline"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Account Pipeline ({leads.length})
            </button>
            <button
              onClick={() => setActiveTab("partnerships")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "partnerships"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Partnership Corner ({partnerships.length})
            </button>
          </div>

          <HelperText text="International local times are updated in real-time" />
        </div>

        {/* Tab 1: 4-Column Pipeline Grid */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {columns.map((col) => {
              const colLeads = leads.filter((l) => l.stage === col.stage);
              return (
                <div key={col.stage} className="rounded-lg border border-edge/80 bg-raised/30 p-3 flex flex-col min-h-[480px]">
                  <div className="flex items-center justify-between border-b border-edge/60 pb-2 mb-2">
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{col.label}</div>
                      <div className="text-[10px] text-muted">{col.helper}</div>
                    </div>
                    <span className="rounded-full bg-surface border border-edge px-2 py-0.5 text-[10px] font-semibold text-muted">
                      {colLeads.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {colLeads.length === 0 ? (
                      <div className="py-8 text-center text-[11px] text-muted">
                        No accounts in this stage.
                      </div>
                    ) : (
                      colLeads.map((lead) => {
                        const localTime = getLocalTime(lead.timezone);
                        return (
                          <div
                            key={lead.id}
                            className="rounded-lg border border-edge bg-surface p-3 shadow-2xs hover:border-teal/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-semibold text-[13px] text-ink">{lead.name}</span>
                              {lead.value && (
                                <span className="text-[11px] font-semibold text-emerald">{lead.value}</span>
                              )}
                            </div>
                            <div className="text-[12px] text-muted">{lead.company}</div>

                            {/* International Timezone badge */}
                            {lead.country && (
                              <div className="mt-2 flex items-center gap-1.5 rounded bg-raised/80 px-2 py-1 text-[11px] text-muted">
                                <Globe className="h-3 w-3 text-sky" />
                                <span>{lead.country}</span>
                                {localTime && (
                                  <span className="font-semibold text-ink ml-auto">Local: {localTime}</span>
                                )}
                              </div>
                            )}

                            {lead.nextFollowUpDate && (
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                                <Clock className="h-3 w-3 text-amber" />
                                <span>Next: {lead.nextFollowUpDate}</span>
                              </div>
                            )}

                            <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between">
                              <RowActions leadId={lead.id} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Partnership Corner */}
        {activeTab === "partnerships" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-ink">
                Strategic Vendor & Agency Partnerships
              </div>
              <HelperText text="Resource augmentation & co-selling partner conversations" />
            </div>

            <div className="divide-y divide-edge/50">
              {partnerships.map((p) => (
                <div key={p.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Handshake className="h-4 w-4 text-teal" />
                      <span className="font-semibold text-[14px] text-ink">{p.partnerName}</span>
                      <span className="rounded bg-teal/10 text-teal border border-teal/20 px-2 py-0.5 text-[11px] font-medium">
                        {p.type}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted mt-1">
                      <span className="font-medium text-ink">Next step: </span>
                      {p.nextStep} (Target: {p.nextStepDate})
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised transition-colors"
                    >
                      Update Next Step
                    </button>
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
