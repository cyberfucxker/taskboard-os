"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { listItem, transition } from "@/lib/motionTokens";

/** Lists whose rows move between positions or groups (task changes status ->
 * row slides to its new place in 200ms). Use a STABLE key per row (the entity
 * id), never the array index. Optimistic updates apply at once; the animation
 * never delays them. No springs. Reduced motion: rows jump, no layout motion.
 *
 * For rows moving BETWEEN groups, render all groups inside ONE LayoutList (or
 * wrap them in one shared <LayoutGroup>) and give LayoutItem a `layoutId`
 * equal to the entity id. */
export function LayoutList({
  children,
  className,
  groupId,
}: {
  children: ReactNode;
  className?: string;
  groupId?: string;
}) {
  return (
    <LayoutGroup id={groupId}>
      <div className={className}>
        <AnimatePresence initial={false} mode="popLayout">
          {children}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

export function LayoutItem({
  children,
  className,
  layoutId,
}: {
  children: ReactNode;
  className?: string;
  /** Only set when the same row can appear in two different lists. */
  layoutId?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      layout="position"
      layoutId={layoutId}
      className={className}
      initial={listItem.initial}
      animate={listItem.animate}
      exit={listItem.exit}
      transition={{ layout: transition.layout }}
    >
      {children}
    </motion.div>
  );
}
