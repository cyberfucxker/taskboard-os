"use client";

import { useMemo, useState } from "react";
import { Clock, Calendar, BarChart3, TrendingUp, Layers, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { fmtMs } from "@/components/today/HoursRing";
import { cn } from "@/lib/cn";

const CAT_LABEL: Record<string, string> = {
  CALL: "Calls & Outreach",
  MEETING: "Client Meetings",
  SCREENING: "Screening",
  BUG_FIX: "Bug Fixes",
  DEVELOPMENT: "Development",
  DESIGN: "Design & Creative",
  CRM: "CRM & Leads",
  ADMIN: "Operations & HR",
  DOCUMENTATION: "Proposals & Reports",
  OTHER: "General",
};

const CAT_COLORS: Record<string, string> = {
  CALL: "var(--teal)",
  SCREENING: "var(--amber)",
  BUG_FIX: "var(--crimson)",
  MEETING: "var(--violet)",
  DEVELOPMENT: "var(--teal)",
  DESIGN: "var(--pink)",
  CRM: "var(--emerald)",
  DOCUMENTATION: "var(--amber)",
  ADMIN: "var(--muted)",
  OTHER: "var(--faint)",
};

interface Day {
  date: string;
  sessionMs: number;
  manualMs: number;
  otMs: number;
  entries: {
    code?: string;
    title?: string;
    category: string;
    ms: number;
    source: "session" | "task" | "manual";
    outcome?: boolean;
  }[];
}

export function TimeReport({
  days,
  categorySummary,
}: {
  days: Day[];
  categorySummary: { category: string; hrs: number }[];
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(days[days.length - 1]?.date ?? null);

  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  const totalWeekMs = useMemo(() => {
    return days.reduce((acc, d) => acc + d.sessionMs + d.manualMs, 0);
  }, [days]);

  const totalOtMs = useMemo(() => {
    return days.reduce((acc, d) => acc + d.otMs, 0);
  }, [days]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Time & Productivity Record</h1>
          <p className="text-[13px] text-muted">
            Shift-aware tracking (09:30–18:30 IST) · Lunch break (13:30–14:10) auto-excluded
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-[10px] border border-edge bg-bg px-4 py-2 text-right">
            <div className="text-[11px] text-muted">7-Day Total</div>
            <div className="tnum text-[16px] font-semibold text-tealhi">
              {fmtMs(totalWeekMs)}
            </div>
          </div>
          {totalOtMs > 0 && (
            <div className="rounded-[10px] border bg-emerald/10 px-4 py-2 text-right">
              <div className="text-[11px] text-emerald">Total OT</div>
              <div className="tnum text-[16px] font-semibold text-emerald">
                +{fmtMs(totalOtMs)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Weekly Category Distribution */}
      {categorySummary.length > 0 && (
        <div className="rounded-[10px] border border-edge bg-bg p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-muted">
              <BarChart3 className="h-4 w-4 text-teal" /> Weekly Distribution by Workstream
            </div>
            <span className="tnum text-[12px] text-muted">
              {(totalWeekMs / 3600000).toFixed(1)}h total
            </span>
          </div>

          {/* Visual Stacked Bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-raised mb-4">
            {categorySummary.map((c) => {
              const pct = (c.hrs / (totalWeekMs / 3600000 || 1)) * 100;
              if (pct < 1) return null;
              return (
                <div
                  key={c.category}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: CAT_COLORS[c.category] ?? "var(--teal)",
                  }}
                  title={`${CAT_LABEL[c.category] ?? c.category}: ${c.hrs}h (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>

          {/* Chips Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {categorySummary.map((c) => (
              <div
                key={c.category}
                className="flex items-center justify-between rounded-lg border border-edge bg-raised/60 p-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: CAT_COLORS[c.category] ?? "var(--teal)" }}
                  />
                  <span className="truncate text-[12px] text-ink">
                    {CAT_LABEL[c.category] ?? c.category}
                  </span>
                </div>
                <span className="tnum text-[12px] font-semibold text-tealhi ml-2 shrink-0">
                  {c.hrs}h
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Breakdown */}
      <div className="space-y-3">
        <div className="text-[12px] text-muted font-medium px-1">
          Daily Log Archive
        </div>
        {days.map((d) => {
          const total = d.sessionMs + d.manualMs;
          const isExpanded = expandedDay === d.date;
          const goalPct = Math.min(100, Math.round((total / (8 * 3600000)) * 100));

          return (
            <div
              key={d.date}
              className="rounded-[10px] border border-edge bg-bg overflow-hidden transition-colors"
            >
              {/* Day Header Accordion */}
              <button
                onClick={() => setExpandedDay(isExpanded ? null : d.date)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-raised/40 transition"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  )}
                  <div>
                    <div className="text-[14px] font-semibold text-ink">{fmtDay(d.date)}</div>
                    <div className="text-[12px] text-muted">
                      {d.entries.length} recorded session{d.entries.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="tnum text-[14px] font-semibold text-ink">
                      {fmtMs(total)}
                    </div>
                    <div className="text-[11px] text-muted">{goalPct}% of 8h</div>
                  </div>
                  {d.otMs > 0 && (
                    <span className="inline-flex items-center rounded-full border bg-emerald/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald">
                      🕛 OT +{fmtMs(d.otMs)}
                    </span>
                  )}
                </div>
              </button>

              {/* Day Entries */}
              {isExpanded && (
                <div className="border-t border-edge p-4 bg-bg/60 space-y-2">
                  {d.entries.length === 0 ? (
                    <div className="text-[12px] text-faint py-2 text-center">
                      No tracked work sessions on this day.
                    </div>
                  ) : (
                    d.entries.map((e, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-lg border border-edge/60 bg-raised px-3.5 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {e.code && (
                              <span className="tnum text-[12px] font-semibold text-muted">
                                {e.code}
                              </span>
                            )}
                            <span className="truncate text-[13px] font-medium text-ink">
                              {e.title ?? "General Work Session"}
                            </span>
                            {e.source === "manual" && (
 <span className="rounded-md border border-edge bg-bg h-8 px-3 text-[13px] text-muted">
                                manual
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-[11px] text-muted">
                              {CAT_LABEL[e.category] ?? e.category}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 tnum text-[13px] font-semibold text-tealhi">
                          {fmtMs(e.ms)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
