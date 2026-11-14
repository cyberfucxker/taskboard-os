"use client";

import { useState } from "react";
import { CheckCircle2, Play, RotateCcw } from "lucide-react";
import type { EndChoice, FocusBlockView } from "@/lib/focus";

const CHOICES: { key: EndChoice; label: string; hint: string; icon: typeof CheckCircle2 }[] = [
  { key: "done", label: "Done", hint: "Close it out", icon: CheckCircle2 },
  { key: "in_progress", label: "Keep in progress", hint: "Still going", icon: Play },
  { key: "todo", label: "Back to To do", hint: "Not today", icon: RotateCcw },
];

/**
 * End-of-block sheet (T8).
 *
 * Ending a block is the one moment where three tasks' statuses all change at once, so
 * the employee is asked per task rather than guessing for them. The default mirrors
 * what focus.ts does server-side: the task that was running stays In progress, the
 * ones they never switched to go back to To do.
 *
 * It is also reused when someone tries to start or pause an unrelated task while a
 * block is running — the block has to end first, and this says so before anything moves.
 */
export function FocusEndSheet({
  block,
  title,
  subtitle,
  confirmLabel = "End focus block",
  busy,
  onCancel,
  onConfirm,
}: {
  block: FocusBlockView;
  title: string;
  subtitle: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (choices: Record<string, EndChoice>) => void | Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, EndChoice>>(() =>
    Object.fromEntries(
      block.tasks.map((t) => [t.id, t.id === block.activeTaskId ? "in_progress" : "todo"])
    )
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[rgba(0,0,0,0.6)] px-4 pt-[10vh] backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-raised shadow-2xl">
        <div className="border-b border-edge p-5">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-surface p-5">
          {block.tasks.map((t) => (
            <div key={t.id} className="rounded-xl border border-edge bg-raised p-4">
              <div className="mb-3 flex items-start gap-2 leading-tight">
                <span className="mt-0.5 font-mono text-xs text-muted">
                  {t.rank}. {t.code}
                </span>
                <span className="flex-1 text-sm font-semibold text-ink">{t.title}</span>
                {t.id === block.activeTaskId && (
                  <span className="rounded bg-tealhi/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-tealhi">
                    running
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CHOICES.map((c) => {
                  const Icon = c.icon;
                  const active = choices[t.id] === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setChoices((prev) => ({ ...prev, [t.id]: c.key }))}
                      title={c.hint}
                      aria-pressed={active}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition ${
                        active
                          ? "border-teal bg-teal/10 text-teal"
                          : "border-edge text-muted hover:border-hover hover:text-ink"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="leading-tight">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-edge p-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-semibold text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(choices)}
            className="rounded-xl bg-teal px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-tealhi disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}