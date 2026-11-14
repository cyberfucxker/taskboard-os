"use client";

import React, { useState } from "react";
import {
  PhoneCall,
  Mail,
  Linkedin,
  MessageSquare,
  Sparkles,
  Calendar,
  Clock,
  ArrowRight,
  UserCheck,
  TrendingUp,
  ExternalLink,
  Target,
} from "lucide-react";
import {
  NeedsMeNow,
  TargetProgress,
  ActionQueue,
  PlainHelperTooltip,
  type NeedsMeItem,
  type ActionQueueItem,
} from "../atoms/DashboardAtoms";
import { useToast } from "@/components/Toast";

// 1. NOVA OUTREACH DASHBOARD (BDE / Cold Outreach)
export function BdeOutreachDashboard({
  needsMeItems = [],
}: {
  needsMeItems?: NeedsMeItem[];
}) {
  const toast = useToast();
  const [queueItems, setQueueItems] = useState<ActionQueueItem[]>([
    {
      id: "lead-1",
      name: "Ross Miller",
      company: "Zenith Retail Corp (E-Commerce)",
      metaBadge: "HOT · Inbound Lead",
      contextText: "Requested SOW audit for Next.js migration and Shopify sync.",
      outcomes: [
        { label: "Booked Discovery", actionKey: "DISCOVERY_BOOKED", color: "teal" },
        { label: "Follow-up", actionKey: "FOLLOW_UP" },
        { label: "Not Interested", actionKey: "NOT_INTERESTED", color: "crimson" },
      ],
    },
    {
      id: "lead-2",
      name: "Anna Lee",
      company: "FinVeda Tech (Fintech)",
      metaBadge: "WARM · LinkedIn Outreach",
      contextText: "Opened cold email 4x, viewed case study on React Native build.",
      outcomes: [
        { label: "Call Scheduled", actionKey: "CALL_SCHEDULED", color: "teal" },
        { label: "Send Case Study", actionKey: "SEND_DECK" },
        { label: "Disqualified", actionKey: "DISQUALIFIED", color: "crimson" },
      ],
    },
    {
      id: "lead-3",
      name: "Victor Singh",
      company: "Dr. Batra Healthcare (Healthtech)",
      metaBadge: "RETAIL · SEO & Ads Audit",
      contextText: "Expressed interest in monthly performance marketing retainers.",
      outcomes: [
        { label: "Passed to Kai", actionKey: "PASS_PRE_SALES", color: "teal" },
        { label: "Send Quote", actionKey: "SEND_QUOTE" },
        { label: "Nurture", actionKey: "NURTURE" },
      ],
    },
  ]);

  function handleActionOutcome(leadId: string, actionKey: string) {
    setQueueItems((prev) => prev.filter((item) => item.id !== leadId));
    toast(`Lead updated: ${actionKey} logged successfully ✓`, "success");
  }

  return (
    <div className="space-y-5 anim-fade pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Outreach & Business Development Desk</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              Nova · BDE Lead
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Cold outreach pipeline, high-velocity calling queue, qualified leads, and booked discovery calls.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      {/* Target Progress & Daily Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <TargetProgress
          title="Daily Qualified Discovery Calls"
          current={4}
          target={6}
          subtext="2 more calls required to hit daily qualification slab"
          slabText="Tier 1 Incentive Active"
        />
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              <PlainHelperTooltip
                term="Outreach Connection Rate"
                explanation="Percentage of cold calls and LinkedIn outreaches resulting in meaningful qualification dialogues."
              />
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-tealhi">28.4%</div>
          </div>
          <p className="text-[11.5px] text-muted">Above agency target of 22%</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Hot Inbounds Waiting
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-ink">{queueItems.length}</div>
          </div>
          <p className="text-[11.5px] text-muted">Avg response time: 14 mins</p>
        </div>
      </div>

      {/* Action Queue */}
      <ActionQueue
        title="High-Priority Calling & Outreach Queue"
        items={queueItems}
        onOutcome={handleActionOutcome}
      />
    </div>
  );
}

// 2. KAI PRE-SALES DASHBOARD (Requirement & SOW Desk)
export function PreSalesDashboard({
  needsMeItems = [],
}: {
  needsMeItems?: NeedsMeItem[];
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Pre-Sales Scoping & SOW Desk</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              Kai · Pre-Sales & Tech BA Lead
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Client requirements scoping, engineering estimates, SOW generation, and handover to Closers.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <TargetProgress
          title="Active SOW Pipeline"
          current={12}
          target={15}
          unit=""
          subtext="8 SOWs ready for client review"
        />
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Pending Dev Estimations
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-amber">3</div>
          </div>
          <p className="text-[11.5px] text-muted">Awaiting Parker / Mika estimation review</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Avg Turnaround Time
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-tealhi">24 hrs</div>
          </div>
          <p className="text-[11.5px] text-muted">From discovery call to draft SOW</p>
        </div>
      </div>

      {/* Scoping Tasks List */}
      <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-hover pb-2.5">
          <h3 className="text-[14px] font-semibold text-ink">Requirements in Scoping</h3>
          <span className="text-[11.5px] text-muted">3 deals awaiting documentation</span>
        </div>

        <div className="space-y-2.5">
          {[
            {
              id: "sow-1",
              title: "Northwind Wealth - Mobile App & Web Trading Portal",
              client: "Northwind Wealth Management",
              budget: "₹4.5L - ₹6.0L",
              status: "Scoping Architecture",
              assignedDev: "Parker (Tech Lead)",
            },
            {
              id: "sow-2",
              title: "Dr. Batra - Clinic Booking & Lead Funnel Revamp",
              client: "Dr. Batra Clinics",
              budget: "₹3.0L",
              status: "Ready for SOW Draft",
              assignedDev: "Mika (Backend)",
            },
          ].map((sow) => (
            <div
              key={sow.id}
              className="flex items-center justify-between p-3 rounded-lg border border-edge bg-bg"
            >
              <div>
                <div className="font-semibold text-[13.5px] text-ink">{sow.title}</div>
                <div className="text-[12px] text-muted mt-0.5">
                  Client: {sow.client} · Budget: {sow.budget} · Dev: {sow.assignedDev}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toast(`Dispatched SOW draft to Skyler/Sage ✓`, "success")}
                className="rounded bg-teal px-3 py-1 text-[11.5px] font-semibold text-bg hover:bg-tealhi transition"
              >
                Handover to Closer
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. SAGE & SKYLER CLOSER DASHBOARD
export function CloserLeadDashboard({
  userName = "Skyler",
  needsMeItems = [],
}: {
  userName?: string;
  needsMeItems?: NeedsMeItem[];
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Closer Command & Deal Pipeline</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              {userName} · Deal Closer Lead
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Hot pipeline negotiations, contract signing, advance payment tracking, and onboarding handovers.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <TargetProgress
          title="Monthly Revenue Closed"
          current={1450000}
          target={2000000}
          unit="₹"
          subtext="₹5.5L remaining to achieve monthly quota"
          slabText="Incentive Multiplier 1.5x"
        />
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Hot Deals in Final Stage
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-tealhi">4</div>
          </div>
          <p className="text-[11.5px] text-muted">Total pipeline value: ₹18.5L</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Advance Invoices Sent
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-ink">2</div>
          </div>
          <p className="text-[11.5px] text-muted">Awaiting client bank transfer</p>
        </div>
      </div>

      {/* Hot Deals to Close */}
      <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
        <h3 className="text-[14px] font-semibold text-ink">Deals Awaiting Final Closure & Payment</h3>
        <div className="space-y-2.5">
          {[
            {
              id: "deal-1",
              client: "Northwind Wealth Management",
              dealSize: "₹4,20,000",
              stage: "Contract Sent for Signature",
              nextStep: "Call CFO for advance payment confirmation",
            },
            {
              id: "deal-2",
              client: "Apex Health Diagnostics",
              dealSize: "₹2,80,000",
              stage: "Commercial Negotiation",
              nextStep: "Offer 5% discount on 6-month upfront retainer",
            },
          ].map((deal) => (
            <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg border border-edge bg-bg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[13.5px] text-ink">{deal.client}</span>
                  <span className="font-mono text-[12px] font-bold text-tealhi">{deal.dealSize}</span>
                </div>
                <div className="text-[12px] text-muted mt-0.5">{deal.stage} · {deal.nextStep}</div>
              </div>
              <button
                type="button"
                onClick={() => toast(`Marked ${deal.client} as WON & Handed over to Peyton (Post-Sales) ✓`, "success")}
                className="rounded bg-teal px-3 py-1 text-[11.5px] font-semibold text-bg hover:bg-tealhi transition"
              >
                Deal Won & Handover
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
