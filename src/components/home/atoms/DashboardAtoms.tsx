"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Award,
  Calendar,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Flag,
  FileCheck2,
  Users,
} from "lucide-react";

// 1. NeedsMeNow Atom
export interface NeedsMeItem {
  id: string;
  title: string;
  context: string;
  type: "CRITICAL_BLOCKER" | "OVERDUE" | "CLIENT_URGENT" | "APPROVAL";
  actionLabel: string;
}

export function NeedsMeNow({ items = [] }: { items: NeedsMeItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-ink shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-red-500/20 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400">
            <Flag className="h-3.5 w-3.5 fill-current" />
          </div>
          <h2 className="text-[14px] font-bold text-ink">Needs Me Now</h2>
          <span className="rounded-full bg-red-500/20 px-2 py-0.2 text-[10.5px] font-bold font-mono text-red-400">
            {items.length} URGENT
          </span>
        </div>
        <span className="text-[11.5px] text-muted">Immediate attention requested</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-edge bg-surface p-3 transition hover:border-hover"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">{item.title}</span>
                <span className="rounded bg-red-500/10 px-1.5 py-0.2 text-[10px] font-mono text-red-400">
                  {item.type}
                </span>
              </div>
              <p className="text-[12px] text-muted">{item.context}</p>
            </div>
            <button
              type="button"
              className="rounded bg-red-500/20 px-3 py-1 text-[11.5px] font-semibold text-red-300 hover:bg-red-500 hover:text-white transition"
            >
              {item.actionLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 2. TargetProgress Atom
export function TargetProgress({
  title,
  current,
  target,
  unit = "",
  subtext,
  slabText,
}: {
  title: string;
  current: number;
  target: number;
  unit?: string;
  subtext?: string;
  slabText?: string;
}) {
  const pct = Math.min(100, Math.round((current / (target || 1)) * 100));

  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">{title}</span>
        {slabText && (
          <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[10.5px] font-mono text-tealhi font-bold">
            {slabText}
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[26px] font-bold font-mono text-ink">
            {unit}
            {current.toLocaleString()}
          </span>
          <span className="text-[13px] text-muted font-mono">
            / {unit}
            {target.toLocaleString()} ({pct}%)
          </span>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg border border-edge">
          <div
            className="h-full rounded-full bg-teal transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {subtext && <p className="text-[11.5px] text-muted">{subtext}</p>}
    </div>
  );
}

// 3. ActionQueue Atom (for Outreach / Fast Calling)
export interface ActionQueueItem {
  id: string;
  name: string;
  company: string;
  metaBadge: string;
  contextText: string;
  outcomes: { label: string; actionKey: string; color?: string }[];
}

export function ActionQueue({
  title = "Outreach Queue",
  items = [],
  onOutcome,
}: {
  title?: string;
  items: ActionQueueItem[];
  onOutcome?: (itemId: string, actionKey: string) => void;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-hover pb-2.5">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <p className="text-[11.5px] text-muted">Tap fast-action outcome to update status instantly</p>
        </div>
        <span className="rounded-full bg-bg border border-edge px-2.5 py-0.5 text-[11px] font-mono text-muted">
          {items.length} In Queue
        </span>
      </div>

      <div className="space-y-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-edge bg-bg hover:border-hover transition"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13.5px] text-ink">{item.name}</span>
                <span className="text-[12px] text-muted">· {item.company}</span>
                <span className="rounded bg-teal/15 px-1.5 py-0.2 text-[10px] font-mono text-tealhi font-bold">
                  {item.metaBadge}
                </span>
              </div>
              <p className="text-[12px] text-muted">{item.contextText}</p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {item.outcomes.map((out) => (
                <button
                  key={out.actionKey}
                  type="button"
                  onClick={() => onOutcome?.(item.id, out.actionKey)}
                  className={`rounded px-2.5 py-1 text-[11.5px] font-semibold transition ${
                    out.color === "teal"
                      ? "bg-teal/20 text-tealhi hover:bg-teal hover:text-bg"
                      : out.color === "crimson"
                      ? "bg-crimson/15 text-crimson hover:bg-crimson hover:text-bg"
                      : "bg-surface border border-edge text-muted hover:border-hover hover:text-ink"
                  }`}
                >
                  {out.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4. VisualBoard Atom (for UI/UX and creatives)
export interface VisualCardItem {
  id: string;
  title: string;
  projectName: string;
  status: string;
  thumbnailUrl?: string;
  category: string;
  author: string;
  timeAgo: string;
}

export function VisualBoard({
  title = "Visual Request Board",
  items = [],
  onOpenCard,
}: {
  title?: string;
  items: VisualCardItem[];
  onOpenCard?: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-hover pb-2.5">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <p className="text-[11.5px] text-muted">Deliverables, asset previews, and handovers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onOpenCard?.(item.id)}
            className="group cursor-pointer rounded-lg border border-edge bg-bg p-3 hover:border-teal/50 hover:bg-surface transition space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="rounded bg-teal/15 px-1.5 py-0.2 text-[10px] font-mono font-bold text-tealhi">
                {item.category}
              </span>
              <span className="text-[11px] text-muted">{item.timeAgo}</span>
            </div>

            <div>
              <h4 className="font-semibold text-[13px] text-ink group-hover:text-tealhi transition truncate">
                {item.title}
              </h4>
              <p className="text-[11.5px] text-muted truncate mt-0.5">📁 {item.projectName}</p>
            </div>

            <div className="flex items-center justify-between border-t border-hover pt-2 text-[11px] text-muted">
              <span>By {item.author}</span>
              <span className="font-mono font-semibold text-ink">{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 5. AutoReportDigest Atom
export function AutoReportDigest({
  title = "Daily Operations Digest",
  dateStr,
  summaryPoints = [],
  metrics = [],
}: {
  title?: string;
  dateStr: string;
  summaryPoints?: string[];
  metrics?: { label: string; value: string; trend?: string }[];
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 text-ink shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-hover pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-tealhi" />
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        </div>
        <span className="text-[11.5px] font-mono text-muted">{dateStr}</span>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {metrics.map((m, idx) => (
            <div key={idx} className="rounded-lg border border-edge bg-bg p-2.5">
              <div className="text-[11px] text-muted uppercase">{m.label}</div>
              <div className="text-[18px] font-bold font-mono text-ink mt-0.5">{m.value}</div>
              {m.trend && <div className="text-[10.5px] text-tealhi font-mono mt-0.5">{m.trend}</div>}
            </div>
          ))}
        </div>
      )}

      {summaryPoints.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {summaryPoints.map((pt, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[12.5px] text-muted">
              <span className="text-tealhi font-bold">›</span>
              <span>{pt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 6. PlainHelperTooltip Atom
export function PlainHelperTooltip({ term, explanation }: { term: string; explanation: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted hover:border-ink transition"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span>{term}</span>
      <HelpCircle className="h-2.5 w-2.5 text-muted inline" />
      {open && (
        <span className="absolute bottom-full left-0 mb-1 z-50 w-48 rounded bg-ink px-2.5 py-1.5 text-[11px] text-bg shadow-lg border border-edge pointer-events-none">
          {explanation}
        </span>
      )}
    </span>
  );
}
