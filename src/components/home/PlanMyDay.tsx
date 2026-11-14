"use client";

import { useMemo, useState } from "react";
import type { PlanSlot, PlanTask } from "./HomeBento";

const SLOTS = [1, 2, 3];

export function PlanMyDay({
  dateStr,
  initialPlan,
  initialTotal,
  candidates,
}: {
  dateStr: string;
  initialPlan: PlanSlot[];
  initialTotal: number;
  candidates: PlanTask[];
}) {
  const [plan, setPlan] = useState<PlanSlot[]>(initialPlan);
  const [total, setTotal] = useState(initialTotal);
  const [slot, setSlot] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pinnedIds = useMemo(() => new Set(plan.map((p) => p.task?.id).filter(Boolean)), [plan]);
  const open = candidates.filter((c) => !pinnedIds.has(c.id));
  const overload = total > 7;

  async function pin(taskId: string) {
    setBusy(taskId);
    setError(null);
    try {
      const res = await fetch("/api/today/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, taskId, dateStr }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Could not pin task");
      setPlan(json.data.commitments);
      setTotal(json.data.totalEstimateHrs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function unpin(s: number) {
    setBusy(`slot-${s}`);
    setError(null);
    try {
      const res = await fetch(`/api/today/plan?slot=${s}&dateStr=${dateStr}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Could not unpin");
      setPlan(json.data.commitments);
      setTotal(json.data.totalEstimateHrs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-edge bg-surface p-4" aria-label="Plan my day">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Plan my day</h2>
        <span className="text-[12px] text-muted">
          {dateStr} · slot{" "}
          {SLOTS.map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              aria-pressed={slot === s}
              className={`mx-0.5 rounded px-2 py-0.5 font-mono transition ${
                slot === s ? "bg-teal/20 font-semibold text-teal" : "bg-raised text-muted hover:text-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </span>
      </div>

      {overload && (
        <p className="mt-2 rounded-md border border-edge bg-raised px-2 py-1 text-[12px] font-medium text-crimson" role="alert">
          Overload — {total}h planned is over the 7h day. Unpin something or split it up.
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-edge bg-raised px-2 py-1 text-[12px] text-crimson" role="alert">
          {error}
        </p>
      )}

      <ol className="mt-3 space-y-2">
        {SLOTS.map((s) => {
          const entry = plan.find((p) => p.slot === s);
          const t = entry?.task ?? null;
          return (
            <li
              key={s}
              className="flex items-center gap-2 rounded-md border border-edge bg-bg px-2.5 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[12px] text-muted">
                {s}
              </span>
              {t ? (
                <>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[13px] font-medium text-ink">{t.title}</div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      {t.code} · {t.status}
                      {t.estimateHrs != null ? ` · ~${t.estimateHrs}h` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => unpin(s)}
                    disabled={busy !== null}
                    className="shrink-0 rounded px-2 py-1 text-[12px] text-muted hover:text-crimson disabled:opacity-50"
                  >
                    {busy === `slot-${s}` ? "…" : "Unpin"}
                  </button>
                </>
              ) : (
                <span className="text-[13px] text-muted">
                  Empty — pick a task below to pin into slot {s}.
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="label mb-1 mt-4">
        Candidates — inbox, overdue, routines ({open.length})
      </div>
      {open.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing waiting. Nice.</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {open.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-hover"
            >
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] text-ink">{c.title}</div>
                <div className="truncate font-mono text-[11px] text-muted">
                  {c.code} · {c.priority}
                  {c.estimateHrs != null ? ` · ~${c.estimateHrs}h` : ""}
                  {c.projectName ? ` · ${c.projectName}` : ""}
                </div>
              </div>
              <button
                onClick={() => pin(c.id)}
                disabled={busy !== null}
                className="shrink-0 rounded-md border border-edge bg-raised px-2.5 py-1 text-[12px] text-ink hover:bg-hover disabled:opacity-50"
              >
                {busy === c.id ? "…" : `Pin → ${slot}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
