"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { useLiveVersion } from "@/components/realtime/RealtimeProvider";
import { useToast } from "@/components/Toast";

interface Commitment {
  slot: number;
  task?: {
    id: string;
    title: string;
    status: string;
    client?: { name?: string | null } | null;
    project?: { name?: string | null } | null;
  } | null;
}

/**
 * "Your top 3" ranked slots. Same data and API as before (/api/commitments);
 * rendered as three airy rows, to be placed inside the workload block.
 * `reloadKey` lets the parent force a refetch after the plan changed elsewhere.
 */
export function TopThree({ reloadKey = 0 }: { reloadKey?: number }) {
  const toast = useToast();
  const live = useLiveVersion();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [pickable, setPickable] = useState<any[]>([]);
  const [pickLoading, setPickLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/commitments").then((r) => r.json());
      if (res?.ok) setCommitments(res.data || []);
    } catch (err) {
      console.error("Failed to load commitments", err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, live, reloadKey]);

  async function openSlot(slot: number) {
    setActiveSlot(slot);
    setPickLoading(true);
    try {
      const res = await fetch("/api/tasks").then((r) => r.json());
      if (res?.ok) setPickable((res.tasks || []).filter((t: any) => t.status !== "DONE"));
    } catch (err) {
      console.error("Failed to load open tasks", err);
    } finally {
      setPickLoading(false);
    }
  }

  async function clearSlot(slot: number) {
    try {
      const res = await fetch(`/api/commitments?slot=${slot}`, { method: "DELETE" }).then((r) => r.json());
      if (res?.ok) {
        setCommitments((prev) => prev.filter((c) => c.slot !== slot));
        toast("Priority slot cleared", "success");
      } else {
        toast(res?.error || "Failed to clear slot", "error");
      }
    } catch {
      toast("Failed to clear slot", "error");
    }
  }

  async function pinSlot(slot: number, taskId: string) {
    try {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, taskId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Priority commitment updated", "success");
        setCommitments((prev) => [...prev.filter((c) => c.slot !== slot), data.data]);
        setActiveSlot(null);
      } else {
        toast(data.error || "Failed to update commitment", "error");
      }
    } catch {
      toast("Network error updating commitment", "error");
    }
  }

  return (
    <div>
      <h3 className="text-[12px] font-medium text-muted">Your top 3</h3>
      <ol className="mt-1 divide-y divide-line">
        {[1, 2, 3].map((slot) => {
          const task = commitments.find((c) => c.slot === slot)?.task;
          return (
            <li key={slot} className="flex min-h-[40px] items-center gap-3 text-[13px]">
              <span className="w-4 shrink-0 text-right text-[12px] tabular-nums text-muted">{slot}</span>
              {task ? (
                <>
                  <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-tealhi">
                    {task.title}
                  </Link>
                  <span className="hidden shrink-0 truncate text-[12px] text-muted sm:inline">
                    {[task.client?.name, task.project?.name].filter(Boolean).join(" · ")}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{task.status.replace(/_/g, " ").toLowerCase()}</span>
                  <button
                    type="button"
                    onClick={() => clearSlot(slot)}
                    title="Clear this slot"
                    aria-label={`Clear slot ${slot}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => openSlot(slot)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-muted hover:text-ink"
                >
                  <Plus className="h-4 w-4" /> Pick a task
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {activeSlot !== null && (
        <div
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onMouseDown={() => setActiveSlot(null)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-[10px] border border-edge bg-raised text-ink shadow-popover anim-up sm:rounded-[10px]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h4 className="text-[15px] font-medium">Pin task to slot {activeSlot}</h4>
              <button type="button" onClick={() => setActiveSlot(null)} aria-label="Close" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {pickLoading ? (
                <p className="py-6 text-center text-[13px] text-muted">Loading your open tasks…</p>
              ) : pickable.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">No open tasks available to pin.</p>
              ) : (
                pickable.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pinSlot(activeSlot, t.id)}
                    className="flex min-h-[36px] w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-hover"
                  >
                    <span className="min-w-0 truncate font-medium text-ink">{t.title}</span>
                    <span className="shrink-0 text-[12px] text-muted">{t.client?.name || ""}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
