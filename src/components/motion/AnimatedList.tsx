"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** R7 draft (LOCAL ONLY). Magic-UI animated-list port: new items slide/fade in
 * at the top, capped at `max` rows. Entering 200ms ease-out; no layout bounce.
 * Reduced-motion: plain list, no animation. Never use inside tables. */

export function AnimatedList({
  items,
  max = 8,
  className,
  renderItem,
}: {
  items: { id: string; node: ReactNode }[];
  max?: number;
  className?: string;
  renderItem?: (node: ReactNode) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const visible = items.slice(0, max);
  if (reduce) {
    return (
      <div className={className}>
        {visible.map((it) => (
          <div key={it.id}>{renderItem ? renderItem(it.node) : it.node}</div>
        ))}
      </div>
    );
  }
  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {visible.map((it) => (
          <motion.div
            key={it.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {renderItem ? renderItem(it.node) : it.node}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
