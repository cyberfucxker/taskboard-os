"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtMinutes, STATUS_LABEL, WIP_LIMIT, type PersonWorkload, type WorkloadTaskView } from "@/lib/workload-core";

/** Status pill classes - token colours only; the label text always carries the meaning. */
export const STATUS_PILL: Record<PersonWorkload["status"], string> = {
  overloaded: "border-crimson text-crimson",
  "no-plan": "border-amber text-amber",
  idle: "border-edge text-muted",
  ok: "border-teal text-teal",
};

export function StatusPill({ status }: { status: PersonWorkload["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Planned-vs-capacity bar. Over-capacity part is crimson AND announced in text. */
export function CapacityBar({ plannedMinutes, capacityMinutes, label }: { plannedMinutes: number; capacityMinutes: number; label: string }) {
  const total = Math.max(plannedMinutes, capacityMinutes, 1);
  const within = Math.min(plannedMinutes, capacityMinutes);
  const over = Math.max(0, plannedMinutes - capacityMinutes);
  const nearFull = capacityMinutes > 0 && within / capacityMinutes >= 0.85;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={capacityMinutes}
      aria-valuenow={Math.min(plannedMinutes, capacityMinutes)}
      aria-valuetext={`${fmtMinutes(plannedMinutes)} planned of ${fmtMinutes(capacityMinutes)}`}
      className="flex h-2 w-full overflow-hidden rounded-full bg-raised"
    >
      <div style={{ width: `${(within / total) * 100}%`, background: nearFull ? "var(--amber)" : "var(--teal)" }} />
      {over > 0 && <div style={{ width: `${(over / total) * 100}%`, background: "var(--crimson)" }} />}
    </div>
  );
}

const Stat = ({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) => (
  <div className="min-w-0">
    <div className={`text-[15px] font-semibold tabular-nums ${warn ? "text-crimson" : "text-ink"}`}>{value}</div>
    <div className="text-[11px] text-muted">{label}</div>
  </div>
);

/**
 * "How much is on my plate today" - planned vs capacity, WIP, overdue, plan check, and a
 * suggested order. Display + one explicit button (apply the order to the plan slots through
 * the existing /api/today/plan). Nothing here changes task status or timers.
 */
export function WorkloadMeter({
  workload, tasks, onChanged, children,
}: { workload: PersonWorkload; tasks: WorkloadTaskView[]; onChanged?: () => void; children?: React.ReactNode }) {
  const [showOrder, setShowOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const w = workload;
  const wip = w.inProgressCount;
  const actionable = tasks.filter((t) => !t.blocked);

  async function applyOrder() {
    const top = actionable.slice(0, 3);
    if (top.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      // EXISTING ranking mechanism: Today plan slots 1-3 (TodayCommitment) via /api/today/plan.
      const res = await fetch("/api/today/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: top.map((t, i) => ({ slot: i + 1, taskId: t.id })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setNote(data.error ?? "Could not apply the order"); return; }
      for (let slot = top.length + 1; slot <= 3; slot += 1) {
        await fetch(`/api/today/plan?slot=${slot}`, { method: "DELETE" }).catch(() => {});
      }
      setNote("Plan updated to the suggested order.");
      onChanged?.();
    } catch {
      setNote("Could not apply the order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Workload today" className="rounded-[10px] border border-edge bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-ink">Workload today</h2>
        <StatusPill status={w.status} />
      </header>

      {children && <div className="mt-3 border-b border-line pb-3">{children}</div>}

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
        <span className="text-ink">
          {fmtMinutes(w.plannedMinutes)} planned <span className="text-muted">of {fmtMinutes(w.capacityMinutes)}</span>
        </span>
        {w.overcommitMinutes > 0 ? (
          <span className="font-medium text-crimson" role="status">
            <span aria-hidden>! </span>Over by {fmtMinutes(w.overcommitMinutes)}
          </span>
        ) : (
          <span className="text-muted">{fmtMinutes(w.capacityMinutes - w.plannedMinutes)} free</span>
        )}
      </div>
      <div className="mt-2">
        <CapacityBar plannedMinutes={w.plannedMinutes} capacityMinutes={w.capacityMinutes} label="Planned work against today's capacity" />
      </div>
      {w.unestimatedCount > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {w.unestimatedCount} planned {w.unestimatedCount === 1 ? "task has" : "tasks have"} no estimate, so this may be under-counted.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`In progress (max ${WIP_LIMIT})`} value={wip} warn={wip > WIP_LIMIT} />
        <Stat label="Overdue" value={w.overdueCount} warn={w.overdueCount >= 3} />
        <Stat label="Due today" value={w.dueTodayCount} />
        <Stat label="Not ranked" value={w.unrankedCount} />
      </div>

      <p className="mt-3 text-[12px] text-ink2" role="status">
        {w.hasPlanToday
          ? w.focusBlockActive ? "Plan check: focus block running." : "Plan check: you have a plan for today."
          : "Plan check: no plan yet. Tap tasks to rank your top 3 for today."}
      </p>

      {actionable.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowOrder((v) => !v)}
            aria-expanded={showOrder}
            className="h-8 rounded-md border border-edge bg-raised px-3 text-[13px] font-medium text-ink hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal"
          >
            {showOrder ? "Hide suggested order" : "Suggested order"}
          </button>
          {showOrder && (
            <div className="mt-2">
              <p className="text-[11px] text-muted">Overdue first, then priority, then due date, then oldest. Blocked tasks last.</p>
              <ol className="mt-2 divide-y divide-line">
                {tasks.slice(0, 8).map((t, i) => (
                  <li key={t.id} className="flex items-baseline gap-2 py-1.5 text-[13px]">
                    <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted">{i + 1}</span>
                    <Link href={`/tasks?task=${encodeURIComponent(t.code)}`} className="min-w-0 flex-1 truncate text-ink hover:text-tealhi hover:underline">
                      <span className="font-mono text-[11px] text-muted">{t.code}</span> {t.title}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted">
                      {t.blocked ? "Blocked" : t.overdue ? "Overdue" : t.priority}
                    </span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                disabled={busy}
                onClick={applyOrder}
                className="mt-2 h-8 rounded-md bg-teal px-3 text-[13px] font-medium text-white hover:bg-tealhi disabled:opacity-50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal"
              >
                {busy ? "Applying..." : "Use as my top 3"}
              </button>
              {note && <p className="mt-1.5 text-[12px] text-ink2" role="status">{note}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
