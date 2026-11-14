"use client";

import React, { useState } from "react";
import {
  Code2,
  Palette,
  Megaphone,
  UserCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitPullRequest,
  AlertTriangle,
  Play,
  TrendingUp,
  BarChart2,
  Calendar,
  Sparkles,
} from "lucide-react";
import {
  NeedsMeNow,
  TargetProgress,
  VisualBoard,
  PlainHelperTooltip,
  type NeedsMeItem,
  type VisualCardItem,
} from "../atoms/DashboardAtoms";
import { RoutineChecklist, type RoutineItem } from "../RoutineChecklist";
import { useToast } from "@/components/Toast";

// 1. DEVELOPERS DASHBOARD (Parker, Mika, Riley, Nina)
export function DeveloperPersonaDashboard({
  userName = "Parker",
  roleTitle = "Tech Lead & Dev Pod",
  needsMeItems = [],
  routines = [],
  workOrders = [],
}: {
  userName?: string;
  roleTitle?: string;
  needsMeItems?: NeedsMeItem[];
  routines?: RoutineItem[];
  workOrders?: any[];
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Developer Pod Workspace</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              {userName} · {roleTitle}
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Active sprint work orders, daily dev routines, code reviews, and blocker alerts.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Active Sprint Work Orders</h3>
                <p className="text-[11.5px] text-muted">Tasks delegated by Post-Sales (Peyton)</p>
              </div>
              <span className="rounded-full bg-bg border border-edge px-2.5 py-0.5 text-[11px] font-mono text-muted">
                {workOrders.length > 0 ? workOrders.length : 3} Active
              </span>
            </div>

            <div className="space-y-2">
              {(workOrders.length > 0
                ? workOrders
                : [
                    {
                      id: "dev-1",
                      code: "DEV-104",
                      title: "Integrate Payment Gateway Webhook & Payment Status Polling",
                      project: "Northwind Wealth Web App",
                      priority: "P0",
                      due: "Today 6 PM",
                      delegator: "Peyton",
                    },
                    {
                      id: "dev-2",
                      code: "DEV-98",
                      title: "Fix responsive layout shift on clinic booking checkout flow",
                      project: "Dr. Batra Portal",
                      priority: "P1",
                      due: "Tomorrow",
                      delegator: "Peyton",
                    },
                    {
                      id: "dev-3",
                      code: "DEV-89",
                      title: "Setup Core Web Vitals Optimization & Script deferrals",
                      project: "FinVeda Mobile",
                      priority: "P2",
                      due: "10 Oct",
                      delegator: "Peyton",
                    },
                  ]
              ).map((task: any) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-edge bg-bg hover:border-hover transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-tealhi">{task.code}</span>
                      <span className="font-semibold text-[13px] text-ink">{task.title}</span>
                      <span className="rounded bg-surface border border-edge px-1.5 py-0.2 text-[9.5px] font-mono text-muted">
                        {task.priority}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-muted">
                      📁 {task.project} · Assigned by {task.delegator} · Due {task.due}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast(`Checked out ${task.code} into active session ✓`, "default")}
                    className="rounded bg-teal/15 px-3 py-1 text-[11.5px] font-semibold text-tealhi hover:bg-teal hover:text-bg transition"
                  >
                    Open Task
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <RoutineChecklist
            routines={
              routines.length > 0
                ? routines
                : [
                    {
                      id: "r-dev-1",
                      title: "Daily Git PR Reviews & Merge Checks",
                      description: "Review pending PRs from pod members and verify CI passes",
                      scheduledTime: "10:00",
                      frequency: "DAILY",
                      priority: "P1",
                    },
                    {
                      id: "r-dev-2",
                      title: "Staging Sanity & Sentry Error Log Triage",
                      description: "Check uncaught exceptions on live/staging apps",
                      scheduledTime: "11:30",
                      frequency: "DAILY",
                      priority: "P2",
                    },
                    {
                      id: "r-dev-3",
                      title: "Sprint Standup & Blocker Sync with Peyton",
                      description: "Confirm ETA on high-priority client deliverables",
                      scheduledTime: "17:00",
                      frequency: "DAILY",
                      priority: "P1",
                    },
                  ]
            }
          />
        </div>
      </div>
    </div>
  );
}

// 2. CREATIVE & UI/UX DASHBOARD (Lane, Sam, Avery)
export function DesignerPersonaDashboard({
  userName = "Lane",
  needsMeItems = [],
  routines = [],
}: {
  userName?: string;
  needsMeItems?: NeedsMeItem[];
  routines?: RoutineItem[];
}) {
  const toast = useToast();

  const creativeRequests: VisualCardItem[] = [
    {
      id: "des-1",
      title: "Hero Section & Mobile UI Revamp",
      projectName: "Northwind Wealth Brand Refresh",
      status: "IN_REVIEW",
      category: "Figma UX",
      author: "Peyton (Post-Sales)",
      timeAgo: "2h ago",
    },
    {
      id: "des-2",
      title: "Meta Ads Carousel Creative (5x Variants)",
      projectName: "Dr. Batra Festive Campaign",
      status: "PENDING",
      category: "Social Creatives",
      author: "Devon (Media Buyer)",
      timeAgo: "4h ago",
    },
    {
      id: "des-3",
      title: "Design System Tokens & Dark Mode Specs",
      projectName: "FinVeda Mobile App",
      status: "APPROVED",
      category: "Design System",
      author: "Peyton",
      timeAgo: "Yesterday",
    },
  ];

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Creative & Design Studio</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              {userName} · UI/UX & Creative Lead
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Design requests from Post-Sales & Performance Marketing, asset reviews, and Figma deliverables.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <VisualBoard
            title="Design & Creative Work Orders"
            items={creativeRequests}
            onOpenCard={(id) => toast(`Opened design deliverable #${id} in preview ✓`, "default")}
          />
        </div>

        <div className="space-y-4">
          <RoutineChecklist
            routines={
              routines.length > 0
                ? routines
                : [
                    {
                      id: "r-des-1",
                      title: "Daily Figma Handovers & Asset Exports",
                      description: "Check dev-ready frames and export SVG/PNG assets",
                      scheduledTime: "11:00",
                      frequency: "DAILY",
                      priority: "P1",
                    },
                    {
                      id: "r-des-2",
                      title: "Design Review with Peyton & Client Feedback",
                      description: "Incorporate client revisions on active Figma drafts",
                      scheduledTime: "16:00",
                      frequency: "DAILY",
                      priority: "P2",
                    },
                  ]
            }
          />
        </div>
      </div>
    </div>
  );
}

// 3. SEO & DIGITAL MARKETING DASHBOARD (Kendall, Sasha, Devon, Harper, Ash, Hayden)
export function MarketingSEOPersonaDashboard({
  userName = "Kendall",
  roleType = "SEO", // "SEO" | "PERFORMANCE_ADS"
  needsMeItems = [],
  routines = [],
}: {
  userName?: string;
  roleType?: "SEO" | "PERFORMANCE_ADS";
  needsMeItems?: NeedsMeItem[];
  routines?: RoutineItem[];
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Growth & Campaign Desk</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              {userName} · {roleType === "PERFORMANCE_ADS" ? "Performance Marketing" : "SEO & Growth Lead"}
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Retainer health, keyword ranking alerts, ad campaign ROAS, and monthly client deliverables.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <TargetProgress
          title={roleType === "PERFORMANCE_ADS" ? "Monthly Managed Ad Spend" : "SEO Organic Traffic Target"}
          current={roleType === "PERFORMANCE_ADS" ? 1450000 : 84}
          target={roleType === "PERFORMANCE_ADS" ? 2000000 : 100}
          unit={roleType === "PERFORMANCE_ADS" ? "₹" : "%"}
          subtext={
            roleType === "PERFORMANCE_ADS"
              ? "Blended ROAS: 3.8x across Meta & Google"
              : "Average client domain rating up by +4.2"
          }
        />
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              {roleType === "PERFORMANCE_ADS" ? "Active Ad Campaigns" : "Monitored Client Retainers"}
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-tealhi">
              {roleType === "PERFORMANCE_ADS" ? "14" : "18"}
            </div>
          </div>
          <p className="text-[11.5px] text-muted">
            <PlainHelperTooltip
              term="Zero SERP Drops"
              explanation="All tracked primary keywords are maintaining top 3 positions."
            />
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">
              Deliverables Due This Week
            </div>
            <div className="mt-1 text-[26px] font-bold font-mono text-ink">6</div>
          </div>
          <p className="text-[11.5px] text-muted">
            4 monthly reports + 2 on-page audits
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
            <h3 className="text-[14px] font-semibold text-ink">Client Growth & Campaign Retainers</h3>
            <div className="space-y-2">
              {[
                {
                  client: "Dr. Batra Healthcare",
                  type: "National SEO & Local GMB Optimization",
                  metric: "+24% Organic Calls",
                  status: "Healthy",
                  nextStep: "Submit October monthly ranking audit",
                },
                {
                  client: "Apex Retail Group",
                  type: "Performance Google Shopping & Search Ads",
                  metric: "ROAS 4.2x (CPL ₹140)",
                  status: "Optimizing",
                  nextStep: "Scale Budget on Tier-1 keywords",
                },
                {
                  client: "FinVeda Solutions",
                  type: "Technical SEO & Backlinks Outreach",
                  metric: "DR 48 (+3 this month)",
                  status: "Healthy",
                  nextStep: "5 guest posts live, 3 pending indexing",
                },
              ].map((c) => (
                <div key={c.client} className="flex items-center justify-between p-3 rounded-lg border border-edge bg-bg">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13px] text-ink">{c.client}</span>
                      <span className="rounded bg-teal/15 px-2 py-0.2 text-[10px] font-mono text-tealhi font-bold">
                        {c.metric}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5">{c.type} · {c.nextStep}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast(`Generated monthly client digest for ${c.client} ✓`, "success")}
                    className="rounded bg-teal/15 px-3 py-1 text-[11.5px] font-semibold text-tealhi hover:bg-teal hover:text-bg transition"
                  >
                    Client Report
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <RoutineChecklist
            routines={
              routines.length > 0
                ? routines
                : [
                    {
                      id: "r-mkt-1",
                      title: "Daily Ad Spends & Budget Pacing Check",
                      description: "Verify daily budget caps on Meta and Google Ads",
                      scheduledTime: "10:30",
                      frequency: "DAILY",
                      priority: "P0",
                    },
                    {
                      id: "r-mkt-2",
                      title: "Google Search Console & 404/Indexing Audit",
                      description: "Check for crawl errors and indexing anomalies",
                      scheduledTime: "12:00",
                      frequency: "DAILY",
                      priority: "P2",
                    },
                    {
                      id: "r-mkt-3",
                      title: "Weekly Backlink Verification & Outreach",
                      description: "Track live high-DA outreach mentions and guest posts",
                      scheduledTime: "15:00",
                      frequency: "WEEKLY",
                      priority: "P2",
                    },
                  ]
            }
          />
        </div>
      </div>
    </div>
  );
}

// 4. PEOPLE / HR & TALENT DASHBOARD (Casey)
export function HRPersonaDashboard({
  userName = "Casey",
  needsMeItems = [],
  routines = [],
}: {
  userName?: string;
  needsMeItems?: NeedsMeItem[];
  routines?: RoutineItem[];
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">People & HR Desk</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              {userName} · HR & Talent Lead
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Hiring pipeline, attendance anomalies, leave requests, and employee onboarding.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Pending Leave Requests</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-tealhi">2</div>
          <p className="text-[11px] text-muted mt-1">Awaiting approval</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Open Hiring Requisitions</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-ink">3</div>
          <p className="text-[11px] text-muted mt-1">Senior Flutter Dev, BDE, SEO Exec</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Attendance Compliance</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-tealhi">96%</div>
          <p className="text-[11px] text-muted mt-1">0 unnotified absences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
            <h3 className="text-[14px] font-semibold text-ink">Active Candidate Pipeline & Interviews</h3>
            <div className="space-y-2">
              {[
                {
                  candidate: "Andy Brooks",
                  role: "Senior React/Next.js Engineer",
                  stage: "Technical Round 2 (with Parker)",
                  time: "Today, 4:00 PM",
                },
                {
                  candidate: "Pia Hart",
                  role: "Business Development Executive",
                  stage: "Final HR / Culture Fit",
                  time: "Tomorrow, 11:30 AM",
                },
              ].map((c) => (
                <div key={c.candidate} className="flex items-center justify-between p-3 rounded-lg border border-edge bg-bg">
                  <div>
                    <div className="font-semibold text-[13px] text-ink">{c.candidate}</div>
                    <div className="text-[11.5px] text-muted">{c.role} · {c.stage}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-amber">{c.time}</span>
                    <button
                      type="button"
                      onClick={() => toast(`Calendar invite confirmed for ${c.candidate} ✓`, "success")}
                      className="rounded bg-teal/15 px-2.5 py-1 text-[11.5px] font-semibold text-tealhi hover:bg-teal hover:text-bg transition"
                    >
                      Coordinate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <RoutineChecklist
            routines={
              routines.length > 0
                ? routines
                : [
                    {
                      id: "r-hr-1",
                      title: "Daily Attendance & Leave Log Verification",
                      description: "Cross-check biometric/check-in logs and approve leaves",
                      scheduledTime: "11:00",
                      frequency: "DAILY",
                      priority: "P1",
                    },
                    {
                      id: "r-hr-2",
                      title: "Hiring Pipeline Triage & Candidate Outreach",
                      description: "Screen new applications on LinkedIn & Cutshort",
                      scheduledTime: "14:30",
                      frequency: "DAILY",
                      priority: "P2",
                    },
                  ]
            }
          />
        </div>
      </div>
    </div>
  );
}
