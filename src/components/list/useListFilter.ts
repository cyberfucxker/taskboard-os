"use client";

/**
 * useListFilter — instant client-side text filter for any list.
 *
 *   const f = useListFilter(rows, (r) => `${r.name} ${r.email}`);
 *   <ListToolbar filter={f} />
 *   {f.filtered.map(...)}
 *
 * - Every whitespace-separated word must appear (case-insensitive) in getText(item).
 * - The raw input value updates at once; the filtered list follows after a
 *   120ms debounce so typing stays smooth on 2000-row lists.
 * - The query is mirrored into the URL as ?q= with history.replaceState (no
 *   navigation, no server refetch) and restored on load.
 * - Filters the rows already loaded: server-side filtering stays untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const LIST_FILTER_DELAY = 120;

export function tokenize(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = text.toLowerCase();
  for (const t of tokens) if (!hay.includes(t)) return false;
  return true;
}

export interface ListFilter<T> {
  /** Raw input value (updates on every keystroke). */
  query: string;
  setQuery: (q: string) => void;
  /** Debounced query that `filtered` was computed from. */
  applied: string;
  tokens: string[];
  filtered: T[];
  shown: number;
  total: number;
  /** True when a non-empty filter is applied. */
  active: boolean;
  clear: () => void;
}

export function useListFilter<T>(
  items: T[],
  getText: (item: T) => string,
  opts: { param?: string; delay?: number; urlSync?: boolean } = {}
): ListFilter<T> {
  const { param = "q", delay = LIST_FILTER_DELAY, urlSync = true } = opts;
  const [query, setQueryState] = useState("");
  const [applied, setApplied] = useState("");
  const getTextRef = useRef(getText);
  getTextRef.current = getText;

  // Restore ?q= once on mount.
  useEffect(() => {
    if (!urlSync) return;
    try {
      const v = new URLSearchParams(window.location.search).get(param);
      if (v) {
        setQueryState(v);
        setApplied(v);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce raw -> applied.
  useEffect(() => {
    if (query === applied) return;
    const id = window.setTimeout(() => setApplied(query), query === "" ? 0 : delay);
    return () => window.clearTimeout(id);
  }, [query, applied, delay]);

  // Mirror applied -> URL (no navigation). The first pass is skipped so a
  // ?q= in the address bar is restored, not wiped, on load.
  const firstMirror = useRef(true);
  useEffect(() => {
    if (firstMirror.current) {
      firstMirror.current = false;
      return;
    }
    if (!urlSync) return;
    try {
      const url = new URL(window.location.href);
      const cur = url.searchParams.get(param) ?? "";
      if (cur === applied) return;
      if (applied) url.searchParams.set(param, applied);
      else url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch { /* ignore */ }
  }, [applied, param, urlSync]);

  const tokens = useMemo(() => tokenize(applied), [applied]);
  const filtered = useMemo(
    () => (tokens.length === 0 ? items : items.filter((it) => matchesTokens(getTextRef.current(it), tokens))),
    [items, tokens]
  );

  const setQuery = useCallback((q: string) => setQueryState(q), []);
  const clear = useCallback(() => {
    setQueryState("");
    setApplied("");
  }, []);

  return {
    query,
    setQuery,
    applied,
    tokens,
    filtered,
    shown: filtered.length,
    total: items.length,
    active: tokens.length > 0,
    clear,
  };
}

/** True at >= 1536px: pages show a persistent peek pane instead of an overlay drawer. */
export function useWideScreen(min = 1536): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${min}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [min]);
  return wide;
}
