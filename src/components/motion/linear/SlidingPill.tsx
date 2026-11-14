"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { transition } from "@/lib/motionTokens";

/** Shared-layout active indicator for pill tabs / segmented controls.
 * The indicator slides between tabs in 200ms ease-out (no spring).
 *
 * Low-level use (to retrofit PillTabs): wrap the tab row in
 *   <LayoutGroup id={groupId}> and render <SlidingPill /> as the first child of
 *   the ACTIVE tab button (button needs `relative`; label needs `relative z-10`).
 * `layoutId` is namespaced by the LayoutGroup id, so two tab bars on one page
 * never steal each other's pill. Always pass a unique `groupId` per bar. */
export function SlidingPill({
  groupId,
  className,
}: {
  groupId: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      layoutId={`tk-pill-${groupId}`}
      className={cn(
        "absolute inset-0 rounded-full border border-edge bg-raised",
        className
      )}
      transition={reduce ? transition.instant : transition.layout}
    />
  );
}

export interface SlidingTab {
  id: string;
  label: ReactNode;
}

/** Ready-made segmented control built on SlidingPill. */
export function SlidingPillTabs({
  groupId,
  tabs,
  value,
  onChange,
  className,
}: {
  groupId: string;
  tabs: SlidingTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <LayoutGroup id={groupId}>
      <div role="tablist" className={cn("inline-flex items-center gap-1", className)}>
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={cn(
                "tk-press relative rounded-full px-3 py-1 text-xs font-medium transition-colors duration-100",
                active ? "text-ink" : "text-muted hover:text-ink"
              )}
            >
              {active && <SlidingPill groupId={groupId} />}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
