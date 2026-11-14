"use client";

import { useEffect, useRef } from "react";
import { NumberTicker } from "../NumberTicker";

/** Stat-tile number built on the existing NumberTicker (en-IN, 200ms ease-out
 * cubic, reduced-motion static, hydration-safe). Difference: it animates from
 * the PREVIOUS value, not from 0, so a tile that is readable on first paint
 * only moves when the number really changes. Set `fromZero` to count up on
 * mount (use sparingly; the plan forbids hiding readable content). */
export function CountUp({
  value,
  decimals = 0,
  duration = 200,
  fromZero = false,
  prefix,
  suffix,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  fromZero?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const prev = useRef<number>(fromZero ? 0 : value);
  const from = prev.current;
  useEffect(() => {
    prev.current = value;
  }, [value]);
  return (
    <span className={className}>
      {prefix}
      <NumberTicker value={value} from={from} decimals={decimals} duration={duration} />
      {suffix}
    </span>
  );
}
