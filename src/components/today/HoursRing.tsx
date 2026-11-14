"use client";

import { cn } from "@/lib/cn";
import { fmtMs } from "@/lib/fmt";

/** Shared formatter, re-exported for components that already import from here. */
export { fmtMs };

export function HoursRing({
  loggedMs,
  goalMs = 8 * 3600 * 1000,
  size = 64,
  className,
}: {
  loggedMs: number;
  goalMs?: number;
  size?: number;
  className?: string;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, goalMs > 0 ? loggedMs / goalMs : 0);
  const over = loggedMs > goalMs;
  const color = over
    ? "var(--emerald)"
    : frac >= 0.75
      ? "var(--emerald)"
      : frac >= 0.4
        ? "var(--teal)"
        : "var(--amber)";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--edge)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-mono text-[10px] tabular-nums", over ? "text-emerald" : "text-ink")}>
          {over ? `+${fmtMs(loggedMs - goalMs)}` : fmtMs(loggedMs)}
        </span>
      </div>
    </div>
  );
}