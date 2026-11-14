"use client";

import { useRouter } from "next/navigation";
import { Coffee, Pause, Play } from "lucide-react";
import { useUniversalTimer } from "@/components/timer/TimerContext";
import { FocusChip } from "@/components/timer/FocusChip";
import { fmtMs } from "@/components/today/HoursRing";

/**
 * Universal timer & hours stripe in the header across all menus.
 * Shows productive time toward 8h, live running task, active break status,
 * and 1-click pause/resume controls.
 */
export function HoursStripe() {
  const router = useRouter();
  const { status, runningTask, isShiftPaused, shiftPauseReason, pauseTask, toggleShiftPause, loading } = useUniversalTimer();

  if (!status) return null;

  const over = status.loggedMs > status.goalMs;

  return (
    <div className="flex items-center gap-2">
      {/* 8h Progress Pill */}
      <button
        onClick={() => router.push("/today")}
        title="Your 8-hour day — click for Today dashboard"
        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-hover bg-raised px-2.5 py-1 text-[12px] text-ink transition hover:border-teal/60"
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: over ? "var(--emerald)" : status.loggedMs >= status.goalMs * 0.75 ? "var(--emerald)" : "var(--tealhi)" }}
        />
        <span className="font-mono tabular-nums">{fmtMs(Math.min(status.loggedMs, status.goalMs))}</span>
        <span className="text-muted">/ {fmtMs(status.goalMs)}</span>
        {status.otMs > 0 && (
          <span className="rounded-full border border-emerald/40 bg-emerald/10 px-1.5 text-[10px] text-emerald">
            +{fmtMs(status.otMs)}
          </span>
        )}
      </button>

      {/* T8: combined timer over the open focus block (renders nothing without one) */}
      <FocusChip />

      {/* Live Running Task + 1-Click Pause */}
      {runningTask && (
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-tealhi/40 bg-tealhi/10 px-2 py-0.5 text-[11px] text-tealhi">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tealhi" />
          <span className="font-mono font-medium">{runningTask.code}</span>
          <button
            onClick={() => pauseTask(runningTask.taskId)}
            disabled={loading}
            title="Pause task timer"
            aria-label="Pause task"
            className="ml-0.5 rounded p-0.5 hover:bg-tealhi/20 hover:text-white transition"
          >
            <Pause className="h-3 w-3 fill-current" />
          </button>
        </div>
      )}

      {/* Break State + 1-Click Resume / Break Action */}
      {isShiftPaused ? (
        <div className="flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] text-amber">
          <Coffee className="h-3 w-3" />
          <span className="hidden md:inline font-medium truncate max-w-[100px]">{shiftPauseReason || "Break"}</span>
          <button
            onClick={() => toggleShiftPause("resume")}
            disabled={loading}
            title="Resume shift"
            aria-label="Resume shift"
            className="ml-0.5 rounded p-0.5 hover:bg-amber/20 hover:text-white transition"
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
        </div>
      ) : !runningTask ? (
        <button
          onClick={() => toggleShiftPause("pause")}
          disabled={loading}
          title="Take a break (pause shift)"
          className="hidden md:inline-flex items-center gap-1 rounded-full border border-hover bg-raised px-2 py-0.5 text-[11px] text-muted hover:border-amber/50 hover:text-amber transition"
        >
          <Coffee className="h-3 w-3" />
          <span>Break</span>
        </button>
      ) : null}
    </div>
  );
}
