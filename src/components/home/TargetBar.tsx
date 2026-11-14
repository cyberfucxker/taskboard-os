import React from "react";
import { HelperText } from "./HelperText";

interface TargetBarProps {
  label: string;
  helper?: string;
  tooltip?: string;
  current: number;
  target: number;
  unit?: string;
  formatValue?: (val: number) => string;
  className?: string;
}

export function TargetBar({
  label,
  helper,
  tooltip,
  current,
  target,
  unit = "",
  formatValue,
  className = "",
}: TargetBarProps) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const formattedCurrent = formatValue ? formatValue(current) : `${current}${unit}`;
  const formattedTarget = formatValue ? formatValue(target) : `${target}${unit}`;

  return (
    <div className={`rounded-lg border border-edge bg-surface p-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-ink">{label}</div>
          {helper && <HelperText text={helper} tooltip={tooltip} />}
        </div>
        <div className="text-right">
          <span className="text-[14px] font-semibold text-ink">{formattedCurrent}</span>
          <span className="text-[12px] text-muted"> / {formattedTarget}</span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              pct >= 100 ? "bg-emerald" : pct >= 50 ? "bg-teal" : "bg-amber"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-muted">{pct}%</span>
      </div>
    </div>
  );
}
