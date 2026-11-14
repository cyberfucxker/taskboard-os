"use client";

import { useState } from "react";
import type { RoutineItem } from "./HomeBento";
export type { RoutineItem };
import { Plus, Sparkles, RefreshCw } from "lucide-react";
import { StartRecurringTaskModal, type RoutinePreset } from "./StartRecurringTaskModal";

export function RoutineChecklist({ routines }: { routines: RoutineItem[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<Partial<RoutinePreset> | null>(null);

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpenRoutineModal(routine?: RoutineItem) {
    if (routine) {
      setActivePreset({
        title: routine.title,
        defaultDescription: routine.description || `Execute daily recurring routine: ${routine.title}`,
        category: "DEVELOPMENT",
        defaultPriority: "P1",
        estimateHrs: 2,
      });
    } else {
      setActivePreset(null);
    }
    setModalOpen(true);
  }

  return (
    <section className="rounded-lg border border-edge bg-surface p-4" aria-label="Routines">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Designation Routines</h2>
          <span className="font-mono text-[12px] text-muted">
            {done.size}/{routines.length}
          </span>
        </div>
        <button
          onClick={() => handleOpenRoutineModal()}
          className="flex items-center gap-1 rounded-md border border-edge bg-bg px-2.5 py-1 text-[12px] font-medium text-teal hover:border-teal hover:text-tealhi transition"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Spawn Recurring Task</span>
        </button>
      </div>

      {routines.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-edge p-3 text-center">
          <p className="text-[13px] text-muted">
            No routines scheduled for today.
          </p>
          <button
            onClick={() => handleOpenRoutineModal()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-teal/15 px-3 py-1 text-[12px] font-medium text-tealhi hover:bg-teal/25 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Choose from Designation Presets</span>
          </button>
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {routines.map((r) => {
            const checked = done.has(r.id);
            return (
              <li key={r.id} className="group flex items-center justify-between gap-2 rounded-md hover:bg-hover">
                <button
                  onClick={() => toggle(r.id)}
                  aria-pressed={checked}
                  className="flex flex-1 items-start gap-2 px-2 py-1.5 text-left transition"
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      checked ? "border-teal bg-teal/30 text-teal" : "border-edge text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 8 8" className="h-3 w-3" fill="currentColor">
                      <path d="M1.5 4.2 3.3 6 6.5 2.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span
                      className={`block truncate text-[13px] ${checked ? "text-muted line-through" : "text-ink"}`}
                    >
                      {r.title}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {r.frequency} · {r.scheduledTime}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => handleOpenRoutineModal(r)}
                  title="Spawn this routine as a project work order"
                  className="mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted opacity-0 transition group-hover:opacity-100 hover:bg-teal/10 hover:text-teal"
                >
                  Spawn Work Order →
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-muted">
        Ticking tracks your day · Click &quot;Spawn Work Order&quot; to assign to target project &amp; cross-functional depts.
      </p>

      <StartRecurringTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialPreset={activePreset}
      />
    </section>
  );
}
