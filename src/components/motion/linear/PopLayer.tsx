"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { fadeUp4, popIn, popInReduced } from "@/lib/motionTokens";

/** Motion wrapper for custom popovers/menus/dialogs that are not Radix.
 * 150ms fade + scale(0.98->1) (or translateY 4px->0 with `variant="fadeUp"`),
 * exit 100ms, Linear ease-out, no spring. Reduced motion: opacity only. */
export function PopLayer({
  open,
  children,
  className,
  style,
  variant = "scale",
  origin = "top left",
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: "scale" | "fadeUp";
  /** CSS transform-origin for the scale variant, e.g. "top right". */
  origin?: string;
}) {
  const reduce = useReducedMotion();
  const v = reduce ? popInReduced : variant === "fadeUp" ? fadeUp4 : popIn;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={className}
          style={{ transformOrigin: origin, ...style }}
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
