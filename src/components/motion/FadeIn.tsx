"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** R7 draft (LOCAL ONLY — do not push to staging until R3 is review/done).
 * Single fade+rise wrapper. Visible at rest: initial state matches server HTML;
 * animation runs only on the client after mount. 150-250ms ease-out, no bounce. */

export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
