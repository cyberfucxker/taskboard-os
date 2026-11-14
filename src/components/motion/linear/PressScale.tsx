"use client";

import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Press feedback: scale(.98) on :active, 100ms, via the `.tk-press` class in
 * the "TaskBoard 3 motion" CSS block (pure CSS: zero JS cost, neutralised by
 * prefers-reduced-motion). Prefer adding className="tk-press" directly to
 * existing buttons/rows; use this wrapper when you need an element. */
export function PressScale({
  as,
  children,
  className,
  ...rest
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag className={cn("tk-press", className)} {...rest}>
      {children}
    </Tag>
  );
}
