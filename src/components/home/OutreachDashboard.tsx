"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Send,
  MessageSquare,
  PhoneCall,
  Calendar,
  Mail,
  ExternalLink,
  Check,
  X,
  Clock,
  ArrowRightLeft,
  Copy,
  Sparkles,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { HelperText } from "./HelperText";
import { TargetBar } from "./TargetBar";
import { RowActions } from "./RowActions";

export interface ProspectItem {
  id: string;
  name: string;
  company: string;
  role?: string;
  source: string;
  channel: "Email" | "LinkedIn" | "WhatsApp";
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  stage: string;
  followUpStep?: number; // 1 = 1st touch, 2 = 2nd follow up, 3 = 3rd follow up
  lastMessageSnippet?: string;
  templateSnippet?: string;
  status: "pending" | "sent" | "replied" | "not_interested" | "meeting_booked";
}

interface OutreachDashboardProps {
  user: { id: string; name: string; email: string };
  needsMeNowItems: ActionItem[];
  prospects: ProspectItem[];
  stats: {
    sentToday: number;
    sentTarget: number;
    repliesToday: number;
    repliesTarget: number;
    meetingsBooked: number;
    meetingsTarget: number;
  };
}

const TEMPLATES: Record<string, string> = {
  Email: "Hi {name}, noticed {company}'s recent growth in tech. We help teams scale development & digital operations effortlessly. Would you be open for a quick 10-min intro this week?",
  LinkedIn: "Hi {name}, great connecting! Loved your work at {company}. We build robust web & mobile products for fast-growing businesses. Would love to share some relevant case studies.",
  WhatsApp: "Hello {name}, following up regarding software development and tech team augmentation for {company}. Let me know if you have 5 mins for a brief chat!",
};

export function OutreachDashboard({
  user,
  needsMeNowItems,
  prospects: initialProspects,
  stats,
}: OutreachDashboardProps) {
  const [prospects, setProspects] = useState<ProspectItem[]>(initialProspects);
  const [selectedProspect, setSelectedProspect] = useState<ProspectItem | null>(
    initialProspects.find((p) => p.status === "pending") || initialProspects[0] || null
  );
  const [activeTab, setActiveTab] = useState<"pending" | "replies" | "followups">("pending");
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [handoverLeadId, setHandoverLeadId] = useState<string | null>(null);

  const handleUpdateProspectStatus = async (
    id: string,
    newStatus: "sent" | "replied" | "not_interested" | "meeting_booked"
  ) => {
    try {
      await fetch(`/api/crm/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "outreach_touch",
          touchOutcome: newStatus,
          stage: newStatus === "meeting_booked" ? "QUALIFIED" : newStatus === "replied" ? "CONTACTED" : "OUTREACH",
        }),
      }).catch(() => null);

      setProspects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
      );

      // Auto-advance to next pending prospect
      const nextPending = prospects.find((p) => p.id !== id && p.status === "pending");
      if (nextPending) {
        setSelectedProspect(nextPending);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getFilteredList = () => {
    switch (activeTab) {
      case "replies":
        return prospects.filter((p) => p.status === "replied");
      case "followups":
        return prospects.filter((p) => (p.followUpStep ?? 1) > 1);
      default:
        return prospects.filter((p) => p.status === "pending");
    }
  };

  const filteredList = getFilteredList();

  const getTemplateText = (prospect: ProspectItem) => {
    const raw = prospect.templateSnippet || TEMPLATES[prospect.channel] || TEMPLATES.Email;
    return raw.replace("{name}", prospect.name).replace("{company}", prospect.company);
  };

  const copyTemplate = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/60 pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink tracking-tight">
            Outreach Desk
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            Personal prospect queue and fast 1-tap outreach logging for today's outreach targets.
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
          label="Messages Sent Today"
          helper="Daily Cold & Follow-up Touches"
          tooltip="Target messages across Email, LinkedIn, and WhatsApp"
          current={stats.sentToday}
          target={stats.sentTarget}
          unit=" sent"
        />
        <TargetBar
          label="Prospect Replies"
          helper="Positive / Warm Responses"
          tooltip="Target warm answers received from prospects"
          current={stats.repliesToday}
          target={stats.repliesTarget}
          unit=" replies"
        />
        <TargetBar
          label="Meetings Booked"
          helper="Intro & Discovery Calls"
          tooltip="Qualified calls scheduled on calendar"
          current={stats.meetingsBooked}
          target={stats.meetingsTarget}
          unit=" booked"
        />
      </div>

      {/* 1. Needs Me Now */}
      <NeedsMeNow
        items={needsMeNowItems}
        title="Needs me now"
        helper="Replies waiting for immediate response and priority follow-ups"
        emptyMessage="No pending prospect replies. Great job keeping the queue clear!"
      />

      {/* 2. Main Focus Panel: 1-at-a-time Outreach Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Prospect List */}
        <div className="lg:col-span-5 rounded-xl border border-edge bg-surface p-4 shadow-sm flex flex-col h-[560px]">
          <div className="flex items-center justify-between border-b border-edge/60 pb-3 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-semibold text-ink">Today's Queue</span>
              <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
                {filteredList.length}
              </span>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 text-[11px]">
              <button
                onClick={() => setActiveTab("pending")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeTab === "pending"
                    ? "bg-teal/10 text-teal border border-teal/20"
                    : "text-muted hover:text-ink"
                }`}
              >
                Queue ({prospects.filter((p) => p.status === "pending").length})
              </button>
              <button
                onClick={() => setActiveTab("replies")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeTab === "replies"
                    ? "bg-emerald/10 text-emerald border border-emerald/20"
                    : "text-muted hover:text-ink"
                }`}
              >
                Replies ({prospects.filter((p) => p.status === "replied").length})
              </button>
              <button
                onClick={() => setActiveTab("followups")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeTab === "followups"
                    ? "bg-amber/10 text-amber border border-amber/20"
                    : "text-muted hover:text-ink"
                }`}
              >
                Follow-ups
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-edge/40 pr-1">
            {filteredList.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-muted">
                No prospects in this list.
              </div>
            ) : (
              filteredList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProspect(p)}
                  className={`w-full text-left p-2.5 rounded-lg my-1 transition-colors flex items-center justify-between gap-2 ${
                    selectedProspect?.id === p.id
                      ? "bg-raised border border-edge"
                      : "hover:bg-raised/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink truncate">{p.name}</span>
                      <span className="text-[11px] text-muted truncate">· {p.company}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                      <span className="font-medium text-teal">{p.channel}</span>
                      {p.followUpStep && p.followUpStep > 1 && (
                        <span className="text-amber">Touch #{p.followUpStep}</span>
                      )}
                      <span>via {p.source}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Active Prospect Action Card */}
        <div className="lg:col-span-7 rounded-xl border border-edge bg-surface p-5 shadow-sm flex flex-col justify-between h-[560px]">
          {selectedProspect ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-edge/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[17px] font-semibold text-ink">{selectedProspect.name}</h3>
                      <span className="rounded bg-teal/10 border border-teal/20 px-2 py-0.5 text-[11px] font-medium text-teal">
                        {selectedProspect.channel}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted mt-0.5">
                      {selectedProspect.role ? `${selectedProspect.role} at ` : ""}
                      <span className="font-medium text-ink">{selectedProspect.company}</span> · Source: {selectedProspect.source}
                    </p>
                  </div>

                  {/* Channel Quick Links */}
                  <div className="flex items-center gap-1.5">
                    {selectedProspect.email && (
                      <a
                        href={`mailto:${selectedProspect.email}`}
                        className="rounded-md border border-edge bg-surface p-1.5 text-muted hover:text-ink hover:bg-raised transition-colors"
                        title="Send Email"
                      >
                        <Mail className="h-4 w-4" />
                      </a>
                    )}
                    {selectedProspect.phone && (
                      <a
                        href={`https://wa.me/${selectedProspect.phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-edge bg-surface p-1.5 text-muted hover:text-emerald hover:bg-raised transition-colors"
                        title="Open WhatsApp"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </a>
                    )}
                    {selectedProspect.linkedinUrl && (
                      <a
                        href={selectedProspect.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-edge bg-surface p-1.5 text-muted hover:text-sky hover:bg-raised transition-colors"
                        title="Open LinkedIn"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Previous Context or Message Snippet */}
                {selectedProspect.lastMessageSnippet && (
                  <div className="mt-3 rounded-lg border border-edge bg-raised/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                      Last Message / Prospect Reply:
                    </div>
                    <p className="text-[12px] text-ink italic leading-relaxed">
                      "{selectedProspect.lastMessageSnippet}"
                    </p>
                  </div>
                )}

                {/* Suggested Template */}
                <div className="mt-3 rounded-lg border border-edge bg-surface p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Suggested Message Template:
                    </div>
                    <button
                      type="button"
                      onClick={() => copyTemplate(getTemplateText(selectedProspect))}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-teal hover:underline"
                    >
                      {copiedTemplate ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedTemplate ? "Copied!" : "Copy text"}</span>
                    </button>
                  </div>
                  <p className="text-[13px] text-ink leading-relaxed bg-raised/40 p-2.5 rounded border border-edge/60">
                    {getTemplateText(selectedProspect)}
                  </p>
                </div>
              </div>

              {/* One-Tap Action Buttons */}
              <div className="border-t border-edge/60 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted">Log Outcome in 1-Click:</span>
                  <HelperText text="Saves directly to lead in TaskBoard CRM" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateProspectStatus(selectedProspect.id, "sent")}
                    className="flex flex-col items-center justify-center rounded-lg border border-edge bg-surface hover:bg-raised p-2.5 text-center transition-colors group"
                  >
                    <Send className="h-4 w-4 text-teal mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[12px] font-medium text-ink">Sent</span>
                    <span className="text-[10px] text-muted">Logged touch</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateProspectStatus(selectedProspect.id, "replied")}
                    className="flex flex-col items-center justify-center rounded-lg border border-emerald/20 bg-emerald/5 hover:bg-emerald/10 p-2.5 text-center transition-colors group"
                  >
                    <MessageSquare className="h-4 w-4 text-emerald mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[12px] font-medium text-emerald">Replied</span>
                    <span className="text-[10px] text-muted">Warm lead</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateProspectStatus(selectedProspect.id, "meeting_booked")}
                    className="flex flex-col items-center justify-center rounded-lg border border-teal/20 bg-teal/5 hover:bg-teal/10 p-2.5 text-center transition-colors group"
                  >
                    <Calendar className="h-4 w-4 text-teal mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[12px] font-medium text-teal">Booked Call</span>
                    <span className="text-[10px] text-muted">Call on cal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateProspectStatus(selectedProspect.id, "not_interested")}
                    className="flex flex-col items-center justify-center rounded-lg border border-edge bg-surface hover:bg-rose/5 p-2.5 text-center transition-colors group"
                  >
                    <X className="h-4 w-4 text-muted group-hover:text-rose mb-1 transition-colors" />
                    <span className="text-[12px] font-medium text-ink group-hover:text-rose">Not for now</span>
                    <span className="text-[10px] text-muted">Archive</span>
                  </button>
                </div>

                {/* Single-click Handover to Kai / Skyler for Warm Leads */}
                <div className="flex items-center justify-between bg-raised/60 p-2.5 rounded-lg border border-edge">
                  <div className="flex items-center gap-1.5 text-[12px] text-muted">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-muted" />
                    <span>Hand warm lead over:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RowActions
                      leadId={selectedProspect.id}
                      onSuccess={() => {
                        handleUpdateProspectStatus(selectedProspect.id, "replied");
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Sparkles className="h-8 w-8 text-teal mb-2" />
              <h4 className="text-[14px] font-medium text-ink">All caught up!</h4>
              <p className="text-[12px] text-muted mt-1 max-w-xs">
                No active prospects remaining in your queue. Check back as new cold leads are imported.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
