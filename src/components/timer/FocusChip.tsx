"use client";

import { useEffect, useState } from "react";
import { Layers, Square } from "lucide-react";
import { useUniversalTimer } from "@/components/timer/TimerContext";
import { blockElapsedMs, focusClockLabel } from "@/lib/focus-clock";

/**
 * T8 — focus block chip for the header.
 *
 * One combined timer over up to 3 tasks, with the 1/2/3 keys moving the timer between
 * them. The clock is a one-second local tick rather than a global one, so a running
 * block never re-renders the rest of the app sixty times a minute.
 *
 * Per-task time is untouched: this number is presentation over the block's start time,
 * while the 8h meter keeps reading TaskWorkSession.
 */
export function FocusChip() {
  const { focusBlock, switchFocusTask, requestEndBlock, isShiftPaused, shiftPausedAt } =
    useUniversalTimer();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!focusBlock) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [focusBlock?.id]);

  // 1/2/3 switch the active task. Same guards as the board shortcuts, so typing in a
  // comment box or holding a modifier never hijacks a block.
  useEffect(() => {
    const block = focusBlock;
    if (!block) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const slot = ["1", "2", "3"].indexOf(e.key);
      const task = slot === -1 ? null : block!.tasks[slot];
      if (!task) return;
      e.preventDefault();
      if (task.id !== block!.activeTaskId) switchFocusTask(task.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusBlock, switchFocusTask]);

  if (!focusBlock) return null;

  const elapsed = blockElapsedMs(
    new Date(focusBlock.startedAt).getTime(),
    isShiftPaused && shiftPausedAt ? new Date(shiftPausedAt).getTime() : null,
    nowMs
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-tealhi/40 bg-tealhi/10 px-2 py-0.5 text-[11px] text-tealhi">
      <Layers className="h-3 w-3 shrink-0" />
      <span className="font-medium">Focus</span>
      <span className="text-tealhi/60">·</span>
      <span className="tabular-nums">{focusBlock.tasks.length} tasks</span>
      <span className="font-mono tabular-nums">{focusClockLabel(elapsed)}</span>

      <div className="ml-0.5 flex items-center gap-1">
        {focusBlock.tasks.map((t) => {
          const active = t.id === focusBlock.activeTaskId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (!active) switchFocusTask(t.id);
              }}
              disabled={active}
              title={`${t.rank}. ${t.title}${active ? " — running (press the number to switch)" : ""}`}
              aria-label={`Switch to task ${t.rank}: ${t.title}`}
              aria-pressed={active}
              className={`h-4 min-w-[1rem] rounded px-1 font-mono text-[10px] leading-none transition ${
                active
                  ? "bg-tealhi text-white"
                  : "border border-tealhi/40 hover:bg-tealhi/20"
              }`}
            >
              {t.rank}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={requestEndBlock}
        title="End focus block"
        aria-label="End focus block"
        className="ml-0.5 rounded p-0.5 transition hover:bg-tealhi/20"
      >
        <Square className="h-3 w-3 fill-current" />
      </button>
    </div>
  );
}