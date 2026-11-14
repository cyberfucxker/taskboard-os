"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** R7 draft (LOCAL ONLY). Stagger container + item: children fade in sequence.
 * 200ms ease-out each, 40ms apart, no bounce. Reduced-motion renders static. */

export function Stagger({
  children,
  className,
  gap = 0.04,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
      }}
    >
      {children}
    </motion.div>
  );
}
