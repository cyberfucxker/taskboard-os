"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

type PushStatus = {
  name: string;
  email: string;
  department: string | null;
  role: string;
  subscriptionCount: number;
  lastSubscribedAt: string | null;
  browsers: { browser: string; subscribedAt: string }[];
};

type ApiResp = {
  ok: boolean;
  error?: string;
  summary?: { total: number; enabled: number; disabled: number };
  employees?: PushStatus[];
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** Notification status for each employee. Collapsible, only visible to leadership + HR (api gates on hrms.view). */
export default function NotificationStatusPanel() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/push-status");
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        const json = (await res.json()) as ApiResp;
        setData(json);
      } catch {
        // silent fail
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (forbidden) {
    return null;
  }

  if (!data || !data.employees) {
    return (
      <div className="rounded-lg border border-edge bg-bg p-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold text-ink">Notifications Status</div>
          <div className="h-4 w-16 animate-pulse rounded bg-raised" />
        </div>
      </div>
    );
  }

  const { summary, employees } = data;
  const on = employees.filter((e) => e.subscriptionCount > 0);
  const off = employees.filter((e) => e.subscriptionCount === 0);
  const pct = summary && summary.total > 0 ? Math.round((summary.enabled / summary.total) * 100) : 0;

  return (
    <div className="rounded-lg border border-edge bg-bg transition-all">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition hover:bg-raised/50"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90"
            )}
          />
          <div className="text-[13px] font-semibold text-ink">Notifications Status</div>
          <span className="rounded bg-hover px-1.5 py-0.5 tnum text-[11px] text-muted">
            {employees.length}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[12px]">
          <span className="flex items-center gap-1.5 text-emerald">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald" /> {on.length} on
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-faint" /> {off.length} off
          </span>
          <span className="tnum tabular-nums text-tealhi">{pct}%</span>
          <span className="text-[11px] text-muted underline decoration-dotted">
            {expanded ? "Hide Details" : "Show Details"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-edge p-3.5 pt-3">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-edge bg-hover md:grid-cols-2">
            {employees.map((e) => {
              const isOn = e.subscriptionCount > 0;
              return (
                <div
                  key={e.email}
                  className="flex items-center gap-3 bg-raised px-3 py-2.5 text-[13px]"
                >
                  <span
                    className={
                      "inline-flex h-2 w-2 shrink-0 rounded-full " +
                      (isOn ? "bg-emerald" : "bg-faint")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{e.name}</div>
                    <div className="truncate tnum text-[11px] text-muted">
                      {e.department ?? "—"}
                      {e.subscriptionCount > 0 ? ` · ${e.browsers.map((b) => b.browser).join(", ")}` : ""}
                      {e.subscriptionCount > 0 ? ` · ${timeAgo(e.lastSubscribedAt)}` : ""}
                    </div>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold " +
                      (isOn
                        ? "bg-teal/15 text-emerald"
                        : "bg-faint/20 text-muted")
                    }
                  >
                    {isOn ? "On" : "Off"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-muted">
            "On" = at least one browser has push notifications active.
          </div>
        </div>
      )}
    </div>
  );
}
