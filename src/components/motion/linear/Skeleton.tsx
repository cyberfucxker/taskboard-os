import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Static token-surface placeholders with a very subtle opacity pulse
 * (0.5-0.8, 1.6s) from the `.tk-skel` class in the "TaskBoard 3 motion" CSS
 * block. Neutralised by prefers-reduced-motion. No shimmer, no gradients.
 * Server-component safe. */

export function SkeletonBlock({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn("tk-skel rounded-md bg-raised", className)}
      style={style}
    />
  );
}

/** One airy list row (38px) matching the TaskBoard 3 task row layout:
 * status dot, short id, title, trailing meta, avatar. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("flex h-[38px] items-center gap-3 px-3", className)}
    >
      <div className="tk-skel h-3.5 w-3.5 shrink-0 rounded-full bg-raised" />
      <div className="tk-skel h-3 w-12 shrink-0 rounded bg-raised" />
      <div className="tk-skel h-3 max-w-[320px] flex-1 rounded bg-raised" />
      <div className="tk-skel ml-auto h-3 w-16 shrink-0 rounded bg-raised" />
      <div className="tk-skel h-5 w-5 shrink-0 rounded-full bg-raised" />
    </div>
  );
}

export function SkeletonRows({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
