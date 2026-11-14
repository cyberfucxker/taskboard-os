"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp4, popInReduced } from "@/lib/motionTokens";

/** Mount/unmount helper: child enters with 150ms fade + translateY(4px),
 * exits in 100ms. `show` toggles it. No first-paint animation. Reduced motion:
 * opacity only. */
export function Presence({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const v = reduce ? popInReduced : fadeUp4;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className={className}
          variants={v}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** AnimatePresence with `initial={false}` preset, so call sites need one import. */
export function PresenceGroup({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}
