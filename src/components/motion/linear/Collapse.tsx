"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { collapseHeight, transition } from "@/lib/motionTokens";

/** Animated height open/close for accordions, sidebar groups and list-group
 * headers. 190ms ease-out. Content is unmounted when closed (cheap lists).
 * Reduced motion: switches instantly, no movement. `initial={false}` so the
 * first paint (and SSR) is already in the right state. */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={className}
          style={{ overflow: "hidden" }}
          variants={collapseHeight}
          initial="closed"
          animate="open"
          exit="closed"
          transition={reduce ? transition.instant : undefined}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
