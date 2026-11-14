"use client";

/**
 * EngagementBoard — per-project engagement in the delegation-dashboard language.
 * Engagement here means signs of life + attention needed, all from existing data:
 * last task activity, open/blocked/overdue counts. No new models, no invented data.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface EngagementRow {
  id: string;
  name: string;
  /** Already redacted server-side unless the viewer may see clients. */
  clientName: string | null;
  open: number;
  blocked: number;
  overdue: number;
  /** IST day key of the latest task activity, or null when never. */
  lastActiveDay: string | null;
  todayKey: string;
}

function activityLabel(row: EngagementRow): string {
  if (!row.lastActiveDay) return "No activity yet";
  if (row.lastActiveDay === row.todayKey) return "Active today";
  return `Last active ${row.lastActiveDay}`;
}

export function EngagementBoard({ rows }: { rows: EngagementRow[] }) {
  const [filter, setFilter] = useState<"ALL" | "ATTENTION" | "ACTIVE" | "QUIET">("ALL");

  const withFlags = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        attention: r.blocked > 0 || r.overdue > 0,
        quiet: r.lastActiveDay !== null && r.lastActiveDay < r.todayKey && r.open > 0,
      })),
    [rows],
  );
  const shown = withFlags.filter((r) => {
    if (filter === "ATTENTION") return r.attention;
    if (filter === "ACTIVE") return r.lastActiveDay === r.todayKey;
    if (filter === "QUIET") return r.quiet && !r.attention;
    return true;
  });

  const attention = withFlags.filter((r) => r.attention).length;
  const activeToday = withFlags.filter((r) => r.lastActiveDay === r.todayKey).length;

  return (
    <div className="space-y-5 p-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
        <div>
          <h1 className="text-[20px] font-bold text-ink">Engagement</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Which work is alive, stuck, or going quiet — per project.
          </p>
        </div>
        <Link
          href="/projects"
          className="rounded-md border border-edge bg-surface px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
        >
          Projects view
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Stat label="Tracked projects" value={rows.length} accent="text-ink" />
        <Stat label="Active today" value={activeToday} accent="text-tealhi" />
        <Stat label="Need attention" value={attention} accent="text-crimson" />
      </div>

      <div className="flex items-center gap-1.5 self-start rounded-lg border border-edge bg-surface p-1">
        {(["ALL", "ATTENTION", "ACTIVE", "QUIET"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded px-3 py-1 text-[12px] font-semibold transition",
              filter === f
                ? "border border-edge bg-bg text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {f === "ALL" ? "All" : f === "ATTENTION" ? "Needs attention" : f === "ACTIVE" ? "Active today" : "Going quiet"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {shown.map((r) => (
          <Card key={r.id} className={cn(r.attention && "border-crimson/40")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {r.clientName && (
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {r.clientName}
                  </span>
                )}
                <h3 className="mt-0.5 truncate text-[15px] font-bold text-ink">
                  <Link href={`/projects/${r.id}`} className="hover:text-tealhi">
                    {r.name}
                  </Link>
                </h3>
              </div>
              {r.attention ? (
                <span className="shrink-0 rounded-full bg-crimson/20 px-2 py-0.5 font-mono text-[10.5px] font-bold text-crimson">
                  ATTENTION
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-teal/20 px-2 py-0.5 font-mono text-[10.5px] font-bold text-tealhi">
                  {r.lastActiveDay === r.todayKey ? "ACTIVE" : "STEADY"}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted">
              <span>{r.open} open</span>
              {r.blocked > 0 && <span className="font-medium text-crimson">{r.blocked} blocked</span>}
              {r.overdue > 0 && <span className="font-medium text-amber">{r.overdue} overdue</span>}
              <span>{activityLabel(r)}</span>
            </div>
          </Card>
        ))}
      </div>
      {shown.length === 0 && (
        <Card>
          <div className="p-8 text-center text-[13px] text-muted">Nothing in this state.</div>
        </Card>
      )}
    </div>
  );
}
