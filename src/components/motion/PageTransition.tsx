"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** R7 draft (LOCAL ONLY). Route-level fade: wraps page content, 150ms
 * ease-out on mount only. Reduced-motion renders static. */

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
