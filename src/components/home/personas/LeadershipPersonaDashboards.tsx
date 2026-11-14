"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Users,
  Building2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  BarChart3,
  Calendar,
} from "lucide-react";
import {
  NeedsMeNow,
  TargetProgress,
  AutoReportDigest,
  PlainHelperTooltip,
  type NeedsMeItem,
} from "../atoms/DashboardAtoms";
import { useToast } from "@/components/Toast";

export function LavFounderDashboard({
  needsMeItems = [],
  companyMetrics = {
    monthlyRevenue: 4850000,
    revenueTarget: 6000000,
    activeProjects: 24,
    teamUtilization: 88,
  },
}: {
  needsMeItems?: NeedsMeItem[];
  companyMetrics?: {
    monthlyRevenue: number;
    revenueTarget: number;
    activeProjects: number;
    teamUtilization: number;
  };
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Founder Command Center</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              Alex · Founder
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Macro agency health, revenue trajectory, key client escalations, and executive decisions.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <TargetProgress
          title="Monthly Agency Revenue"
          current={companyMetrics.monthlyRevenue}
          target={companyMetrics.revenueTarget}
          unit="₹"
          subtext="80.8% of monthly target achieved"
          slabText="Runway: 14+ Months"
        />
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Active Client Projects</div>
            <div className="mt-1 text-[26px] font-bold font-mono text-ink">{companyMetrics.activeProjects}</div>
          </div>
          <p className="text-[11.5px] text-muted">
            Managed by Peyton (Post-Sales) & Jordan (COO)
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Team Capacity Utilization</div>
            <div className="mt-1 text-[26px] font-bold font-mono text-tealhi">{companyMetrics.teamUtilization}%</div>
          </div>
          <p className="text-[11.5px] text-muted">
            Balanced across Dev, Design & SEO pods
          </p>
        </div>
      </div>

      <AutoReportDigest
        title="Executive Daily Briefing"
        dateStr={new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
        metrics={[
          { label: "New Deals Won", value: "₹4.2L", trend: "+12% vs last week" },
          { label: "Client Retainers", value: "18 Active", trend: "100% renewal" },
          { label: "Critical Blockers", value: "0", trend: "All green" },
        ]}
        summaryPoints={[
          "Pre-sales closed Northwind Wealth SOW for ₹4.2L; kick-off scheduled with Parker's dev pod.",
          "Design pod completed Dr. Batra UX milestone on schedule.",
          "Meta Ads CAC dropped by 18% following Devon's campaign restructuring.",
        ]}
      />
    </div>
  );
}

export function CooDashboard({
  needsMeItems = [],
  projects = [],
}: {
  needsMeItems?: NeedsMeItem[];
  projects?: any[];
}) {
  const toast = useToast();

  return (
    <div className="space-y-5 anim-fade pb-12">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-ink">Operations Control Room</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              Jordan · COO & Delivery Lead
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Cross-department SLA monitoring, blocker resolutions, sprint velocity, and resource allocations.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Dev Pod Velocity</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-tealhi">94%</div>
          <p className="text-[11px] text-muted mt-1">4 pods active</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Design Turnaround</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-ink">1.8d</div>
          <p className="text-[11px] text-muted mt-1">SLA: &lt; 2.5d</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">SEO Retainers Health</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-tealhi">98%</div>
          <p className="text-[11px] text-muted mt-1">0 ranking drops</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Active Blockers (⚑)</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-amber">1</div>
          <p className="text-[11px] text-muted mt-1">Client API credential pending</p>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
        <h3 className="text-[14px] font-semibold text-ink">Department Workload & Delivery Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { dept: "Engineering / Dev", lead: "Parker / Mika", tasks: 16, health: "Healthy", color: "text-teal" },
            { dept: "UI/UX & Creative", lead: "Lane / Sam", tasks: 9, health: "Healthy", color: "text-teal" },
            { dept: "Digital Marketing & SEO", lead: "Kendall / Devon", tasks: 22, health: "On Track", color: "text-teal" },
          ].map((d) => (
            <div key={d.dept} className="rounded-lg border border-edge bg-bg p-3">
              <div className="font-semibold text-[13px] text-ink">{d.dept}</div>
              <div className="text-[11.5px] text-muted mt-0.5">Leads: {d.lead}</div>
              <div className="mt-3 flex items-center justify-between border-t border-hover pt-2 text-[11px]">
                <span className="text-muted">{d.tasks} active work orders</span>
                <span className={`font-semibold ${d.color}`}>{d.health}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KinjalChiefOfStaffDashboard({
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
            <h1 className="text-[20px] font-bold text-ink">Chief of Staff Operations</h1>
            <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold text-tealhi font-mono">
              Kit · Chief of Staff
            </span>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Internal audits, leadership priorities, policy compliance, and cross-team alignment.
          </p>
        </div>
      </div>

      {needsMeItems.length > 0 && <NeedsMeNow items={needsMeItems} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <TargetProgress
          title="Q4 Strategic OKR Progress"
          current={78}
          target={100}
          unit="%"
          subtext="On track for agency scaling milestones"
        />
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Department Audits Completed</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-ink">6 / 7</div>
          <p className="text-[11px] text-muted mt-1">HR & Hiring audit pending</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm">
          <div className="text-[12px] font-semibold text-muted uppercase tracking-wider">Action Items for Founders</div>
          <div className="mt-1 text-[24px] font-bold font-mono text-tealhi">3</div>
          <p className="text-[11px] text-muted mt-1">Awaiting sign-off</p>
        </div>
      </div>
    </div>
  );
}
