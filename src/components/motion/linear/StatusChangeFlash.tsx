"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { duration, ease } from "@/lib/motionTokens";

/** Wraps a row/card. When `value` (e.g. the task status) changes after mount,
 * a 1px edge flash in --teal at 20% alpha fades out over 400ms. Opacity only,
 * pointer-events none, never on first paint. Reduced motion: no flash.
 * The wrapper is `relative`; give it the row's rounded radius via className. */
export function StatusChangeFlash({
  value,
  children,
  className,
}: {
  value: string | number;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const last = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      if (!reduce) setN((x) => x + 1);
    }
  }, [value, reduce]);
  return (
    <div className={cn("relative", className)}>
      {children}
      {n > 0 && (
        <motion.span
          key={n}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ border: "1px solid color-mix(in srgb, var(--teal) 20%, transparent)" }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: duration.flash, ease: ease.out }}
        />
      )}
    </div>
  );
}
