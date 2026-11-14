"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WIP_LIMIT } from "@/lib/workload-core";

export interface WipTask { id: string; code: string; title: string }

const BTN =
  "rounded-md border px-3 py-2 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)] disabled:opacity-50";

/**
 * SOFT guard shown when a person tries to start a task while already holding WIP_LIMIT (3) tasks
 * IN_PROGRESS. Three honest ways out - park one, run the three as a focus block, or start anyway.
 * It never blocks: the API and admins' status changes are untouched; this lives only in the
 * client "start task" path.
 */
export function WipGuardDialog({
  open, inProgress, busyId, onPark, onFocusBlock, onStartAnyway, onCancel,
}: {
  open: boolean;
  inProgress: WipTask[];
  busyId: string | null;
  onPark: (taskId: string) => void;
  /** Omit to hide the focus-block choice. */
  onFocusBlock?: (taskIds: string[]) => void;
  onStartAnyway: () => void;
  onCancel: () => void;
}) {
  const top3 = inProgress.slice(0, WIP_LIMIT);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto border-edge bg-surface text-ink">
        <DialogHeader>
          <DialogTitle>You already have {inProgress.length} tasks in progress</DialogTitle>
          <DialogDescription className="text-muted">
            Working on more than {WIP_LIMIT} things at once slows everything down. Park one, or group three
            into a focus block and run them in order.
          </DialogDescription>
        </DialogHeader>

        <section aria-label="Park one">
          <h3 className="text-[11px] font-semibold uppercase tracking-label text-muted">Park one (back to To do)</h3>
          <ul className="mt-2 divide-y divide-line">
            {inProgress.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  <span className="font-mono text-[11px] text-muted">{t.code}</span> {t.title}
                </span>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => onPark(t.id)}
                  className={`${BTN} shrink-0 border-edge text-ink hover:bg-hover`}
                >
                  {busyId === t.id ? "Parking..." : "Park"}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {onFocusBlock && (
            <button
              type="button"
              disabled={busyId !== null || top3.length === 0}
              onClick={() => onFocusBlock(top3.map((t) => t.id))}
              className={`${BTN} border-teal text-teal hover:bg-hover`}
            >
              Start focus block with {top3.length} of them
            </button>
          )}
          <button type="button" onClick={onStartAnyway} className={`${BTN} border-edge text-ink2 hover:bg-hover`}>
            Start anyway
          </button>
          <button type="button" onClick={onCancel} className={`${BTN} border-transparent text-muted hover:text-ink`}>
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
