import Link from "next/link";
import type { ReactNode } from "react";
import type { StatTileData } from "@/lib/dept-metrics";

/** Pure formatting - safe on server and client (always IST, no locale of the viewer). */
const DAY_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const LONG_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
export const fmtDay = (d: Date | null | undefined) => (d ? DAY_FMT.format(d) : "No date");
export const fmtLongDay = (d: Date) => LONG_FMT.format(d);
export const fmtAge = (days: number) => (days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`);
export const fmtHrs = (h: number) => `${Math.round(h * 10) / 10}h`;

export const LINK_CLS =
  "rounded-sm underline-offset-2 hover:text-tealhi hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]";

/** Status -> colour token (always paired with a text label, never colour alone). */
export const STATUS_VAR: Record<string, string> = {
  TODO: "var(--muted)",
  IN_PROGRESS: "var(--teal)",
  IN_REVIEW: "var(--amber)",
  BLOCKED: "var(--crimson)",
  DONE: "var(--emerald)",
};

export function WidgetShell({
  title, href, hrefLabel = "View all", children,
}: { title: string; href?: string; hrefLabel?: string; children: ReactNode }) {
  return (
    <section className="h-full" aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[12px] font-medium text-muted">{title}</h2>
        {href && (
          <Link href={href} className={`text-[12px] text-ink2 ${LINK_CLS}`}>
            {hrefLabel} <span aria-hidden>→</span>
          </Link>
        )}
      </header>
      <div className="pt-1">{children}</div>
    </section>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-[13px] text-ink2">{title}</p>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorBlock({ hint = "Could not load this section. Refresh to try again." }: { hint?: string }) {
  return (
    <div role="alert" className="py-6 text-center">
      <p className="text-[13px] text-crimson">Something went wrong</p>
      <p className="mt-1 text-[12px] text-muted">{hint}</p>
    </div>
  );
}

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-raised ${className}`} />;
}

export function WidgetSkeleton({ title, rows = 4 }: { title?: string; rows?: number }) {
  return (
    <section className="h-full" aria-busy="true" aria-label={title ? `${title} loading` : "Loading"}>
      <div>
        {title ? (
          <h2 className="mb-3 text-[12px] font-medium text-muted">{title}</h2>
        ) : (
          <Pulse className="mb-3 h-3 w-24" />
        )}
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Pulse key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="border-l border-line pl-3">
          <Pulse className="h-3 w-16" />
          <Pulse className="mt-3 h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

const TONE: Record<NonNullable<StatTileData["tone"]>, string> = {
  default: "text-ink",
  good: "text-ink",
  warn: "text-amber",
  bad: "text-crimson",
};

export function StatTile({ tile }: { tile: StatTileData }) {
  return (
    <Link
      href={tile.href}
      className="group block rounded-md border-l border-line py-1 pl-3 transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"
    >
      <p className="text-[12px] font-medium text-muted">{tile.label}</p>
      <p className={`mt-1 text-[22px] font-medium leading-none tabular-nums ${TONE[tile.tone ?? "default"]}`}>{tile.value}</p>
      {tile.hint && <p className="mt-1 text-[12px] text-faint">{tile.hint}</p>}
    </Link>
  );
}
