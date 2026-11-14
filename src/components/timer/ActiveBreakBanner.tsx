"use client";

import React, { useEffect, useState } from "react";
import { Coffee, Play, Pause, Clock } from "lucide-react";
import { useUniversalTimer } from "@/components/timer/TimerContext";

function formatDuration(startIso: string | null): string {
  if (!startIso) return "00:00";
  const start = new Date(startIso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - start) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function ActiveBreakBanner() {
  const { isShiftPaused, shiftPauseReason, shiftPausedAt, toggleShiftPause, loading } = useUniversalTimer();
  const [elapsed, setElapsed] = useState<string>("00:00");

  useEffect(() => {
    if (!isShiftPaused || !shiftPausedAt) return;
    setElapsed(formatDuration(shiftPausedAt));
    const interval = setInterval(() => {
      setElapsed(formatDuration(shiftPausedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [isShiftPaused, shiftPausedAt]);

  if (!isShiftPaused) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between border-b border-amber/30 bg-amber/15 px-4 py-2 text-ink backdrop-blur-md anim-fade">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber/20 text-amber">
          <Coffee className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium">
          <span className="text-amber">Active Break:</span>
          <span className="text-ink font-semibold">{shiftPauseReason || "Shift Paused"}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[11px] text-amber">
            <Clock className="h-3 w-3" /> {elapsed}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => toggleShiftPause("resume")}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-teal px-3 py-1 text-[12px] font-semibold text-white transition hover:bg-tealhi disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Resume Shift</span>
        </button>
      </div>
    </div>
  );
}
