"use client";

import { useEffect, useState } from "react";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export function RunningTimerTile({
  running,
  loggedMs,
  goalMs,
}: {
  running: { taskId: string; code: string; title: string; startedAtMs: number } | null;
  loggedMs: number;
  goalMs: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const hrs = Math.round((loggedMs / 3600000) * 10) / 10;
  const goal = Math.round((goalMs / 3600000) * 10) / 10;
  const pct = goalMs > 0 ? Math.min(100, Math.round((loggedMs / goalMs) * 100)) : 0;

  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <div className="label mb-1">Timer</div>
      {running ? (
        <>
          <div className="font-mono text-2xl font-semibold text-teal">
            {fmt(now - running.startedAtMs)}
          </div>
          <p className="mt-1 truncate text-[13px] text-ink" title={running.title}>
            {running.code} · {running.title}
          </p>
        </>
      ) : (
        <>
          <div className="text-2xl font-semibold text-ink">Paused</div>
          <a href="/today" className="mt-1 block text-[13px] text-muted hover:text-ink">
            Nothing running — start from Today →
          </a>
        </>
      )}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {hrs}h of {goal}h today
      </p>
    </div>
  );
}
