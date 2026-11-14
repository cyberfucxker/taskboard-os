import Link from "next/link";
import type { ReactNode } from "react";
import type { Result } from "@/lib/dept-metrics-common";
import type { DeptWidget } from "../types";
import { EmptyBlock, ErrorBlock, LINK_CLS, WidgetShell } from "../ui";

/**
 * Small shared kit for the Sales / HR / Finance / Leadership widgets (Lane D).
 * Server-safe: no hooks, no browser APIs, no Date.now(), no locale formatting, so nothing here
 * can cause a hydration mismatch. Colours come only from CSS variables.
 */

/** Async server components satisfy the widget contract at runtime; React 18 types do not know it yet. */
export const asComponent = (c: unknown) => c as DeptWidget["Component"];

export type Tone = "teal" | "emerald" | "amber" | "crimson" | "muted";
export const TONE_VAR: Record<Tone, string> = {
  teal: "var(--teal)",
  emerald: "var(--emerald)",
  amber: "var(--amber)",
  crimson: "var(--crimson)",
  muted: "var(--muted)",
};

/**
 * Renders a metric Result inside the standard widget shell: designed denied and error states,
 * otherwise whatever `children(data)` returns. Children decide their own empty state.
 */
export function ResultView<T>({
  title, result, href, hrefLabel, children,
}: {
  title: string;
  result: Result<T>;
  href?: string;
  hrefLabel?: string;
  children: (data: T) => ReactNode;
}) {
  if (result.state === "denied") {
    return (
      <WidgetShell title={title}>
        <EmptyBlock title="Not available for your role" hint={result.reason} />
      </WidgetShell>
    );
  }
  if (result.state === "error") {
    return (
      <WidgetShell title={title}>
        <ErrorBlock hint={`${result.message}. Refresh to try again.`} />
      </WidgetShell>
    );
  }
  return (
    <WidgetShell title={title} href={href} hrefLabel={hrefLabel}>
      {children(result.data)}
    </WidgetShell>
  );
}

/** A horizontal bar. Never the only signal: callers always print the number beside it. */
export function Bar({ pct, tone = "teal", label }: { pct: number; tone?: Tone; label: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: TONE_VAR[tone] }} />
    </div>
  );
}

export const ROW_CLS = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5";

/** Entity links. Every name that has a home is a link to it. */
export function PersonLink({ id, name }: { id: string | null; name: string | null }) {
  if (!id || !name) return <span className="text-muted">Unassigned</span>;
  return <Link href={`/team/${id}`} className={`text-ink2 ${LINK_CLS}`}>{name}</Link>;
}
export function ClientLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/clients/${id}`} className={`text-ink ${LINK_CLS}`}>{name}</Link>;
}
export function LeadLink({ id, name, company }: { id: string; name: string; company?: string | null }) {
  return (
    <Link href={`/crm/leads/${id}`} className={`text-ink ${LINK_CLS}`}>
      {name}
      {company ? <span className="text-muted"> · {company}</span> : null}
    </Link>
  );
}

/** A "+N more" footer line that links to the full list. */
export function MoreLink({ shown, total, href, noun }: { shown: number; total: number; href: string; noun: string }) {
  if (total <= shown) return null;
  return (
    <p className="pt-2 text-[12px] text-muted">
      <Link href={href} className={`text-ink2 ${LINK_CLS}`}>
        +{total - shown} more {noun} <span aria-hidden>→</span>
      </Link>
    </p>
  );
}

/** Status pill: colour plus a text label, never colour alone. */
export function Pill({ text, tone }: { text: string; tone: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        color: TONE_VAR[tone],
        background: `color-mix(in srgb, ${TONE_VAR[tone]} 12%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}

/** Humanise an enum-ish source such as META_LEAD_ADS or whatsapp. */
export function humanise(s: string): string {
  const t = s.replace(/[_-]+/g, " ").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : s;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
