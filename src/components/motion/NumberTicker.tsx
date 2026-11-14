"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/** R7 draft (LOCAL ONLY). Magic-UI number-ticker port: counts from `from` to
 * `value`, formatted en-IN. Hydration-safe: server renders the final value as
 * static text; animation runs only after mount. Reduced-motion renders static. */

function formatIN(n: number, decimals = 0): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function NumberTicker({
  value,
  from = 0,
  decimals = 0,
  duration = 200,
  className,
}: {
  value: number;
  from?: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // ease-out cubic, no bounce
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, from, duration, reduce]);

  const shown = display ?? value;
  return (
    <span suppressHydrationWarning className={className}>
      {formatIN(shown, decimals)}
    </span>
  );
}
