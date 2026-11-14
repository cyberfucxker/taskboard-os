"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Send,
  CheckCircle2,
  Clock,
  Briefcase,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  DollarSign,
  UserCheck,
  Building,
  Sparkles,
  Share2,
  TrendingUp,
  Globe
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "../shared/NeedsMeNow";
import { HelperText } from "../shared/HelperText";
import { TargetBar } from "../shared/TargetBar";
import { RowActions } from "../shared/RowActions";

export interface RequirementLead {
  id: string;
  name: string;
  company: string;
  channel?: string;
  source: string;
  createdAt: string;
  budgetRange?: string;
  timeline?: string;
  decisionMaker?: string;
  requirementsSummary?: string;
  lastMessageSnippet?: string;
  status: "pending_requirements" | "deck_sent" | "proposal_drafting" | "proposal_sent" | "ready_for_closer";
  daysInStage?: number;
}

export interface FreelanceJob {
  id: string;
  title: string;
  platform: "Upwork" | "Freelancer" | "Fiverr" | "Direct";
  budget: string;
  postedAgo: string;
  clientCountry?: string;
  descriptionSnippet: string;
  status: "new" | "bid_sent" | "reply_waiting" | "interview" | "won" | "lost";
}

interface RequirementDeskProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  leads: RequirementLead[];
  freelanceJobs: FreelanceJob[];
  stats: {
    requirementsDone: number;
    requirementsTarget: number;
    bidsSent: number;
    bidsTarget: number;
    proposalsSent: number;
    proposalsTarget: number;
  };
}

export function RequirementDeskDashboard({
  user,
  needsMeNowItems,
  leads: initialLeads,
  freelanceJobs: initialJobs,
  stats,
}: RequirementDeskProps) {
  const [leads, setLeads] = useState<RequirementLead[]>(initialLeads);
  const [selectedLead, setSelectedLead] = useState<RequirementLead | null>(initialLeads[0] || null);
  const [activeTab, setActiveTab] = useState<"leads" | "proposals" | "freelance">("leads");
  const [freelanceJobs, setFreelanceJobs] = useState<FreelanceJob[]>(initialJobs);

  // Form states for requirement sheet
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [decisionMaker, setDecisionMaker] = useState("");
  const [reqSummary, setReqSummary] = useState("");
  const [savingReq, setSavingReq] = useState(false);
  const [deckSent, setDeckSent] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSelectLead = (lead: RequirementLead) => {
    setSelectedLead(lead);
    setBudget(lead.budgetRange || "");
    setTimeline(lead.timeline || "");
    setDecisionMaker(lead.decisionMaker || "");
    setReqSummary(lead.requirementsSummary || "");
    setDeckSent(lead.status === "deck_sent");
  };

  const handleSaveRequirements = async (andHandover = false) => {
    if (!selectedLead) return;
    setSavingReq(true);
    try {
      await fetch(`/api/crm/leads/${selectedLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetRange: budget,
          timeline: timeline,
          decisionMaker: decisionMaker,
          requirementsSummary: reqSummary,
          status: andHandover ? "ready_for_closer" : selectedLead.status,
          stage: andHandover ? "NEGOTIATION" : "QUALIFIED",
        }),
      }).catch(() => null);

      setLeads((prev) =>
        prev.map((l) =>
          l.id === selectedLead.id
            ? {
                ...l,
                budgetRange: budget,
                timeline: timeline,
                decisionMaker: decisionMaker,
                requirementsSummary: reqSummary,
                status: andHandover ? "ready_for_closer" : l.status,
              }
            : l
        )
      );

      setSuccessMsg(
        andHandover
          ? "Lead & requirement sheet sent to Sage (Closer) successfully!"
          : "Requirement sheet saved!"
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } finally {
      setSavingReq(false);
    }
  };

  const handleSendDeck = async () => {
    if (!selectedLead) return;
    setDeckSent(true);
    await fetch(`/api/crm/leads/${selectedLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_deck",
        deckType: "Standard Acme Intro & Case Study",
      }),
    }).catch(() => null);

    setSuccessMsg("Standard Acme Intro Deck & Case Studies logged as sent!");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Requirement & Pre-Sales Desk
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Capture lead scopes, manage proposals, track freelance job boards, and handover to closers.
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
          label="Requirement Sheets"
          helper="Leads Scoped & Qualified"
          tooltip="Requirement questionnaires completed for incoming leads"
          current={stats.requirementsDone}
          target={stats.requirementsTarget}
          unit=" scoped"
        />
        <TargetBar
          label="Freelance Bids Sent"
          helper="Upwork / Freelancer Proposals"
          tooltip="Bids submitted on relevant high-budget jobs"
          current={stats.bidsSent}
          target={stats.bidsTarget}
          unit=" bids"
        />
        <TargetBar
          label="Proposals Out"
          helper="Proposals with Pricing Sent"
          tooltip="Formal proposals delivered to clients"
          current={stats.proposalsSent}
          target={stats.proposalsTarget}
          unit=" sent"
        />
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="New outreach handovers, proposals waiting on pricing, and platform interview invites"
        emptyMessage="No pending requirements or proposal blockers."
      />

      {/* 2. Main Work Panel with Tabs */}
      <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("leads")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "leads"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Incoming Leads ({leads.length})
            </button>
            <button
              onClick={() => setActiveTab("freelance")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "freelance"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Freelance Platforms ({freelanceJobs.length})
            </button>
            <button
              onClick={() => setActiveTab("proposals")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeTab === "proposals"
                  ? "bg-teal/10 text-teal border border-teal/20"
                  : "text-muted hover:text-ink hover:bg-raised"
              }`}
            >
              Proposal Tracker
            </button>
          </div>

          <HelperText text="Oldest leads prioritized first for fast response times" />
        </div>

        {successMsg && (
          <div className="mb-4 rounded-lg bg-emerald/10 border border-emerald/20 p-2.5 text-[12px] font-medium text-emerald">
            {successMsg}
          </div>
        )}

        {/* Tab 1: Incoming Handover Leads & Requirement Sheet */}
        {activeTab === "leads" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[520px]">
            {/* Left Column: Leads List */}
            <div className="lg:col-span-5 border-r border-edge/60 pr-4 space-y-2">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider mb-2">
                Handed Over From Outreach
              </div>
              {leads.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-muted">
                  No new leads waiting for requirements.
                </div>
              ) : (
                leads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedLead?.id === lead.id
                        ? "bg-raised border-teal/40 shadow-xs"
                        : "border-edge/60 hover:bg-raised/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-ink">{lead.name}</span>
                      <span className="text-[10px] text-muted">{lead.createdAt}</span>
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">
                      {lead.company} · Source: <span className="text-teal font-medium">{lead.source}</span>
                    </div>
                    {lead.lastMessageSnippet && (
                      <p className="text-[11px] text-ink/80 italic mt-1.5 line-clamp-1 bg-surface/80 p-1.5 rounded border border-edge/40">
                        "{lead.lastMessageSnippet}"
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Right Column: Requirement Sheet & Handover Action */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              {selectedLead ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-edge/60 pb-3">
                    <div>
                      <h3 className="text-[16px] font-semibold text-ink">{selectedLead.name}</h3>
                      <p className="text-[12px] text-muted">{selectedLead.company} · Channel: {selectedLead.channel || "Email"}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSendDeck}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                          deckSent
                            ? "bg-emerald/10 text-emerald border border-emerald/20"
                            : "border border-edge bg-surface text-ink hover:bg-raised"
                        }`}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>{deckSent ? "Deck Sent ✓" : "Send Intro Deck"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-muted mb-1">
                        Budget Range (e.g. ₹2L - ₹5L or $5k - $10k)
                      </label>
                      <input
                        type="text"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder="Estimated budget..."
                        className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-muted mb-1">
                        Timeline (e.g. 4-6 weeks)
                      </label>
                      <input
                        type="text"
                        value={timeline}
                        onChange={(e) => setTimeline(e.target.value)}
                        placeholder="Target launch date..."
                        className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-muted mb-1">
                      Decision Maker & Stakeholders
                    </label>
                    <input
                      type="text"
                      value={decisionMaker}
                      onChange={(e) => setDecisionMaker(e.target.value)}
                      placeholder="e.g. CTO (Tech decision) + CEO (Commercial sign-off)"
                      className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-muted mb-1">
                      Requirements & Scope Summary
                    </label>
                    <textarea
                      rows={4}
                      value={reqSummary}
                      onChange={(e) => setReqSummary(e.target.value)}
                      placeholder="Summarize key features, tech stack requirements, user flows, and integrations..."
                      className="w-full rounded border border-edge bg-surface px-3 py-2 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="border-t border-edge/60 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <RowActions
                        leadId={selectedLead.id}
                        onSuccess={() => handleSaveRequirements(false)}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveRequirements(false)}
                        disabled={savingReq}
                        className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised transition-colors disabled:opacity-50"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveRequirements(true)}
                        disabled={savingReq || !reqSummary.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-4 py-1.5 text-[12px] font-medium text-white hover:bg-tealhi transition-colors shadow-sm disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Ready for Closer (Sage)</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Sparkles className="h-8 w-8 text-teal mb-2" />
                  <p className="text-[13px] text-muted">Select a lead on the left to review messages and scope requirements.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Freelance Platforms (Upwork, Freelancer, etc.) */}
        {activeTab === "freelance" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                New Opportunities & Active Bids
              </div>
              <HelperText text="Jobs won here automatically become CRM Deals" />
            </div>

            <div className="divide-y divide-edge/50">
              {freelanceJobs.map((job) => (
                <div key={job.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13px] text-ink">{job.title}</span>
                      <span className="rounded bg-sky/10 text-sky border border-sky/20 px-2 py-0.5 text-[10px] font-medium">
                        {job.platform}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald">{job.budget}</span>
                    </div>
                    <p className="text-[12px] text-muted mt-1 line-clamp-1">{job.descriptionSnippet}</p>
                    <div className="text-[11px] text-muted mt-0.5">
                      Posted {job.postedAgo} {job.clientCountry && `· Client in ${job.clientCountry}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted px-2 py-1 rounded bg-raised">
                      Status: {job.status.replace("_", " ")}
                    </span>
                    <button
                      type="button"
                      className="rounded border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors"
                    >
                      Update Bid
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Proposal Tracker */}
        {activeTab === "proposals" && (
          <div className="space-y-3">
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Proposals in Pipeline
            </div>
            <div className="divide-y divide-edge/50">
              {leads
                .filter((l) => l.status === "proposal_sent" || l.status === "proposal_drafting")
                .map((l) => (
                  <div key={l.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-medium text-ink">{l.name} · {l.company}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        Status: <span className="font-medium text-teal">{l.status.replace("_", " ")}</span>
                        {l.daysInStage && ` · Sent ${l.daysInStage} days ago`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RowActions leadId={l.id} />
                    </div>
                  </div>
                ))}
              {leads.filter((l) => l.status === "proposal_sent" || l.status === "proposal_drafting").length === 0 && (
                <div className="py-8 text-center text-[12px] text-muted">
                  No active proposals waiting for client reply.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
