"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Globe,
  Search,
  FileText,
  Link2,
  BarChart3,
  CheckCircle2,
  Clock,
  ExternalLink,
  DollarSign,
  ArrowUpRight,
  Filter,
  Plus
} from "lucide-react";
import { NeedsMeNow, ActionItem } from "./NeedsMeNow";
import { TargetBar } from "./TargetBar";
import { HelperText } from "./HelperText";
import { RowActions } from "./RowActions";

export interface KeywordMovement {
  id: string;
  client: string;
  keyword: string;
  prevRank: number;
  currentRank: number;
  url: string;
  status: "improved" | "dropped" | "stable";
}

export interface ContentQueueItem {
  id: string;
  client: string;
  title: string;
  type: "Blog Post" | "Landing Page" | "Case Study" | "Ad Copy";
  assignee: string;
  dueDate: string;
  status: "Drafting" | "Review Waiting" | "Approved" | "Published";
}

export interface CampaignPulse {
  id: string;
  client: string;
  platform: "Google Ads" | "Meta" | "LinkedIn";
  dailySpend: number;
  budgetCap: number;
  leadsThisMonth: number;
  costPerLead: number;
  cplStatus: "healthy" | "high" | "critical";
}

interface MarketingSeoDashboardProps {
  personName?: string;
  roleType?: "seo_specialist" | "content_writer" | "performance_marketer";
}

export function MarketingSeoDashboard({
  personName = "Kendall",
  roleType = "seo_specialist"
}: MarketingSeoDashboardProps) {
  const [activeTab, setActiveTab] = useState<"seo" | "content" | "campaigns">("seo");

  const needsMeItems: ActionItem[] = [
    {
      id: "seo-alert-1",
      title: "Acme Corp: Main keyword 'ERP software' dropped 4 positions (Pos 3 → 7)",
      category: "Ranking Drop",
      urgency: "high",
      dueText: "Check on-page & backlinks today",
      contextUrl: "/seo/acme-corp",
      assigneeName: personName
    },
    {
      id: "cont-rev-2",
      title: "Fintech Daily: 2 landing page copies waiting for SEO meta & intent sign-off",
      category: "Content Review",
      urgency: "medium",
      dueText: "Due 3:00 PM",
      contextUrl: "/content/fintech-lp",
      assigneeName: personName
    }
  ];

  const keywordMovements: KeywordMovement[] = [
    {
      id: "kw-1",
      client: "Acme Cloud",
      keyword: "cloud erp software india",
      prevRank: 3,
      currentRank: 7,
      url: "https://cloud.example.com/erp",
      status: "dropped"
    },
    {
      id: "kw-2",
      client: "Globex Healthcare",
      keyword: "telemedicine app platform",
      prevRank: 12,
      currentRank: 5,
      url: "https://globex-health.example.com/telemed",
      status: "improved"
    },
    {
      id: "kw-3",
      client: "Apex Logistics",
      keyword: "cold chain tracking sdk",
      prevRank: 4,
      currentRank: 4,
      url: "https://logistics.example.com/sdk",
      status: "stable"
    },
    {
      id: "kw-4",
      client: "Nexus Fintech",
      keyword: "pci dss compliance automation",
      prevRank: 18,
      currentRank: 9,
      url: "https://nexus-fintech.example.com/compliance",
      status: "improved"
    }
  ];

  const contentQueue: ContentQueueItem[] = [
    {
      id: "cq-1",
      client: "Globex Healthcare",
      title: "HIPAA vs GDPR for Telehealth in 2026",
      type: "Blog Post",
      assignee: "Sasha (Writer)",
      dueDate: "Today",
      status: "Review Waiting"
    },
    {
      id: "cq-2",
      client: "Acme Cloud",
      title: "Enterprise Migration Playbook",
      type: "Landing Page",
      assignee: "Devon (SEO)",
      dueDate: "Tomorrow",
      status: "Drafting"
    },
    {
      id: "cq-3",
      client: "Nexus Fintech",
      title: "Payment Gateway Latency Benchmarks",
      type: "Case Study",
      assignee: "Harper (Content)",
      dueDate: "Oct 08",
      status: "Approved"
    }
  ];

  const campaigns: CampaignPulse[] = [
    {
      id: "cmp-1",
      client: "Apex Logistics",
      platform: "Google Ads",
      dailySpend: 3200,
      budgetCap: 3500,
      leadsThisMonth: 48,
      costPerLead: 850,
      cplStatus: "healthy"
    },
    {
      id: "cmp-2",
      client: "Globex Healthcare",
      platform: "Meta",
      dailySpend: 4500,
      budgetCap: 4500,
      leadsThisMonth: 22,
      costPerLead: 1950,
      cplStatus: "critical"
    },
    {
      id: "cmp-3",
      client: "Nexus Fintech",
      platform: "LinkedIn",
      dailySpend: 6000,
      budgetCap: 8000,
      leadsThisMonth: 19,
      costPerLead: 2400,
      cplStatus: "high"
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Growth & Search Desk
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {personName} • Marketing & SEO
            </span>
          </div>
          <HelperText
            text="Client search rankings, content pipeline review, backlink campaigns, and ad spend pacing."
            tooltip="Data updates automatically from connected Search Console, GA4, and Ad accounts."
          />
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/seo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            Rank Tracker
          </Link>
          <Link
            href="/content"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Content Piece
          </Link>
        </div>
      </div>

      {/* Targets & Pulse Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TargetBar
          label="Top 10 Keywords Across Clients"
          current={142}
          target={160}
          unit="kws"
          helper="Goal: 160 keywords in Page 1"
          color="blue"
        />
        <TargetBar
          label="Organic Lead Inflow (M-o-M)"
          current={88}
          target={110}
          unit="leads"
          helper="Target: 110 qualified inbound leads"
          color="emerald"
        />
        <TargetBar
          label="Content Published This Month"
          current={18}
          target={24}
          unit="articles"
          helper="75% of monthly editorial calendar delivered"
          color="purple"
        />
      </div>

      {/* Needs Me Now */}
      <NeedsMeNow
        items={needsMeItems}
        title="Immediate Growth Attention"
        helper="Critical rank shifts and client editorial approvals waiting on you."
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("seo")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "seo"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="w-4 h-4" />
          SEO & Keyword Movements
        </button>
        <button
          onClick={() => setActiveTab("content")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "content"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-4 h-4" />
          Content Production Queue
        </button>
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "campaigns"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Paid Ad Campaigns
        </button>
      </div>

      {/* Tab 1: SEO & Keyword Movements */}
      {activeTab === "seo" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Live Keyword Movements (Last 7 Days)
              </h3>
              <HelperText text="Track position gains and drops directly from Google Search Console." />
            </div>
            <span className="text-xs text-muted-foreground">
              Auto-synced today at 6:00 AM
            </span>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {keywordMovements.map((kw) => (
              <div
                key={kw.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                      {kw.client}
                    </span>
                    <span className="font-medium text-sm text-foreground">
                      {kw.keyword}
                    </span>
                  </div>
                  <a
                    href={kw.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    {kw.url}
                    <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      {kw.status === "improved" && (
                        <span className="flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          <TrendingUp className="w-3.5 h-3.5 mr-1" />
                          Pos {kw.currentRank} (▲ {kw.prevRank - kw.currentRank})
                        </span>
                      )}
                      {kw.status === "dropped" && (
                        <span className="flex items-center text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                          <TrendingDown className="w-3.5 h-3.5 mr-1" />
                          Pos {kw.currentRank} (▼ {kw.currentRank - kw.prevRank})
                        </span>
                      )}
                      {kw.status === "stable" && (
                        <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded bg-muted">
                          Pos {kw.currentRank} (No change)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Previous: Pos {kw.prevRank}
                    </span>
                  </div>

                  <RowActions
                    itemId={kw.id}
                    itemTitle={`${kw.client} - ${kw.keyword}`}
                    itemType="task"
                    onUpdateStatus={() => alert(`Reviewing SEO on-page for ${kw.keyword}`)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Content Production Queue */}
      {activeTab === "content" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Editorial & Content Pipeline
              </h3>
              <HelperText text="Every article, landing page, and case study in production." />
            </div>
            <Link
              href="/content/calendar"
              className="text-xs font-medium text-primary hover:underline"
            >
              View Full Editorial Calendar →
            </Link>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card/60 divide-y divide-border/50">
            {contentQueue.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                      {item.client}
                    </span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {item.type}
                    </span>
                    <span className="font-medium text-sm text-foreground">
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Writer: {item.assignee}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Due: {item.dueDate}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      item.status === "Review Waiting"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : item.status === "Approved"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : item.status === "Published"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {item.status}
                  </span>

                  <RowActions
                    itemId={item.id}
                    itemTitle={item.title}
                    itemType="task"
                    onUpdateStatus={() => alert(`Status updated for ${item.title}`)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Paid Ad Campaigns */}
      {activeTab === "campaigns" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Active Client Ad Campaigns
              </h3>
              <HelperText text="Monitor daily budget burn, cost per lead (CPL), and lead conversions." />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {campaigns.map((cmp) => (
              <div
                key={cmp.id}
                className="p-5 rounded-xl border border-border/60 bg-card/60 flex flex-col justify-between gap-4 hover:border-primary/40 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                      {cmp.client}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {cmp.platform}
                    </span>
                  </div>

                  <div className="pt-2">
                    <div className="text-2xl font-bold text-foreground">
                      {cmp.leadsThisMonth}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        leads generated
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-3 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Daily Burn</span>
                    <span className="font-semibold text-foreground">
                      ₹{cmp.dailySpend.toLocaleString()} / ₹{cmp.budgetCap.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Cost per Lead</span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded ${
                        cmp.cplStatus === "healthy"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : cmp.cplStatus === "high"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      ₹{cmp.costPerLead} ({cmp.cplStatus})
                    </span>
                  </div>
                </div>

                <RowActions
                  itemId={cmp.id}
                  itemTitle={`${cmp.client} Ad Campaign`}
                  itemType="task"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
