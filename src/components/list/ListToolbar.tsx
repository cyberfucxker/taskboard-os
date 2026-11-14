"use client";

/**
 * ListToolbar — the one search/filter bar every list page uses.
 *
 * Search input (data-page-filter, so "/" focuses it; Esc clears), filter pills,
 * result count, optional saved-view menu, view toggle, "Jump to…" (⌘K) chip and
 * a primary action slot. Pair it with useListFilter (pass `filter`) or drive it
 * by hand with `query` / `onQueryChange`.
 *
 * Matches are highlighted inside the page's [data-list-body] (or <main>) with
 * the CSS Custom Highlight API, so rows need no changes.
 */
import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui";
import type { ListFilter } from "./useListFilter";

export interface ListPill {
  id: string;
  label: React.ReactNode;
  count?: number;
  active?: boolean;
  onClick: () => void;
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  return Boolean(h.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

/** Opens the command palette by sending the same Cmd/Ctrl+K key event the shell listens for. */
export function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
}

export function JumpChip({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      title="Jump to… (⌘K)"
      className={cn(
        "hidden h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted transition-colors hover:bg-raised hover:text-ink sm:inline-flex",
        className
      )}
    >
      <span>Jump to…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

/** "/" focuses the page's filter input (the one marked data-page-filter) from anywhere on the page. */
export function usePageFilterShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTyping(document.activeElement)) return;
      const el = document.querySelector<HTMLInputElement>("input[data-page-filter]");
      if (!el) return;
      e.preventDefault();
      el.focus();
      el.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const HL_STYLE_ID = "tk-list-highlight-style";

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };

/** Highlight query tokens inside list bodies without touching React-rendered rows. */
export function useDomHighlight(tokens: string[]) {
  const key = tokens.join(" ");
  useEffect(() => {
    const registry = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
    const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!registry || !HighlightCtor) return;
    if (!document.getElementById(HL_STYLE_ID)) {
      const st = document.createElement("style");
      st.id = HL_STYLE_ID;
      st.textContent = "::highlight(tk-match){background-color:color-mix(in srgb,var(--teal) 30%,transparent);color:inherit}";
      document.head.appendChild(st);
    }
    if (tokens.length === 0) {
      registry.delete("tk-match");
      return;
    }
    let raf = 0;
    const paint = () => {
      const roots: Element[] = Array.from(document.querySelectorAll("[data-list-body]"));
      if (roots.length === 0) {
        const m = document.querySelector("main");
        if (m) roots.push(m);
      }
      const ranges: Range[] = [];
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            const p = n.parentElement;
            if (!p || p.closest("script, style, [data-list-toolbar], [data-no-highlight]")) return NodeFilter.FILTER_REJECT;
            return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        });
        let node: Node | null;
        let guard = 0;
        while ((node = walker.nextNode()) && guard++ < 6000) {
          const text = (node.nodeValue ?? "").toLowerCase();
          for (const t of tokens) {
            let i = text.indexOf(t);
            while (i !== -1) {
              const r = new Range();
              r.setStart(node, i);
              r.setEnd(node, i + t.length);
              ranges.push(r);
              i = text.indexOf(t, i + t.length);
            }
          }
        }
      }
      registry.set("tk-match", new HighlightCtor(...ranges));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    };
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      registry.delete("tk-match");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function ListToolbar<T = unknown>({
  filter,
  query: queryProp,
  onQueryChange,
  tokens: tokensProp,
  shown,
  total,
  placeholder = "Filter…",
  pills,
  children,
  savedViews,
  viewToggle,
  primary,
  noun,
  sticky = false,
  stickyTop = 0,
  className,
  hideJump = false,
}: {
  /** Result of useListFilter; or drive manually with query/onQueryChange. */
  filter?: ListFilter<T>;
  query?: string;
  onQueryChange?: (q: string) => void;
  tokens?: string[];
  shown?: number;
  total?: number;
  placeholder?: string;
  pills?: ListPill[];
  /** Extra filter controls (selects, chips) shown after the pills. */
  children?: React.ReactNode;
  /** Saved-view menu, when the page already has one. */
  savedViews?: React.ReactNode;
  viewToggle?: React.ReactNode;
  primary?: React.ReactNode;
  /** "tasks" -> "12 tasks" / "3 of 12 tasks". */
  noun?: string;
  /** Stick to the top of the nearest scroller (use when not inside StickyList). */
  sticky?: boolean;
  /** Pixel offset when another sticky bar (e.g. the CRM sub-nav) sits above. */
  stickyTop?: number;
  className?: string;
  hideJump?: boolean;
}) {
  const query = filter ? filter.query : queryProp ?? "";
  const setQuery = filter ? filter.setQuery : onQueryChange ?? (() => {});
  const tokens = filter ? filter.tokens : tokensProp ?? query.toLowerCase().split(/\s+/).filter(Boolean);
  const shownN = shown ?? filter?.shown;
  const totalN = total ?? filter?.total;
  const inputRef = useRef<HTMLInputElement>(null);

  useDomHighlight(tokens);

  usePageFilterShortcut();

  const filtering = query.trim().length > 0;
  const countLabel =
    shownN == null || totalN == null
      ? null
      : filtering && shownN !== totalN
        ? `${shownN} of ${totalN}${noun ? ` ${noun}` : ""}`
        : `${totalN}${noun ? ` ${noun}` : ""}`;

  return (
    <div
      data-list-toolbar=""
      style={sticky && stickyTop ? { top: stickyTop } : undefined}
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2",
        sticky && "sticky top-0 z-[5]",
        className
      )}
    >
      <div className="relative w-full min-w-[160px] sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          data-page-filter=""
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              if (query) setQuery("");
              else inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          aria-label="Filter this list"
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full rounded-md border border-edge bg-transparent pl-8 pr-8 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-teal focus:outline-none"
        />
        {filtering ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear filter"
            className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:block">
            <Kbd>/</Kbd>
          </span>
        )}
      </div>

      {pills && pills.length > 0 && (
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none">
          {pills.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={p.onClick}
              aria-pressed={p.active}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                p.active ? "border-edge bg-hover text-ink" : "border-transparent text-muted hover:bg-raised hover:text-ink"
              )}
            >
              {p.label}
              {p.count != null && <span className="tnum text-[11.5px] text-muted">{p.count}</span>}
            </button>
          ))}
        </div>
      )}

      {children}

      {countLabel && <span className="tnum shrink-0 text-[12px] text-muted">{countLabel}</span>}
      <div className="flex-1" />
      {savedViews}
      {viewToggle}
      {!hideJump && <JumpChip />}
      {primary}
    </div>
  );
}

/** Empty-result state shown when a filter matches nothing. */
export function NoMatches({ onClear, filter, className }: { onClear?: () => void; filter?: ListFilter<unknown>; className?: string }) {
  const clear = onClear ?? filter?.clear;
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-16 text-center", className)}>
      <Search className="h-5 w-5 text-faint" />
      <p className="text-[13px] text-muted">No matches</p>
      {clear && (
        <button
          type="button"
          onClick={clear}
          className="h-8 rounded-md border border-edge px-3 text-[13px] font-medium text-ink2 transition-colors hover:bg-hover"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}
