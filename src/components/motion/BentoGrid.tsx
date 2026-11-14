"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FadeIn } from "./FadeIn";

/** R7 draft (LOCAL ONLY). Magic-UI bento-grid port rewritten to TaskBoard tokens:
 * CSS grid only (no motion on the grid itself — tiles may use FadeIn).
 * Tiles sit on token surfaces (`bg-raised`, `border-edge`, `text-ink`). */

export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function BentoTile({
  children,
  className,
  span = false,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  span?: boolean;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <FadeIn
      className={cn(
        "rounded-2xl border border-edge bg-raised p-4 shadow-xl",
        span && "sm:col-span-2",
        className
      )}
    >
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
          )}
          {action}
        </div>
      )}
      {children}
    </FadeIn>
  );
}
