"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

/**
 * Realtime refresh — the browser half (server half: src/lib/realtime.ts).
 *
 * One EventSource per tab on /api/stream. When the server announces a change (anyone's — your
 * own edit, a teammate's, a webhook, a cron job), every kind of screen catches up without a
 * manual reload:
 *   - server-rendered pages: `router.refresh()` re-renders them with fresh data (client state
 *     such as open drawers and half-typed forms is kept — that is what refresh() guarantees);
 *   - React Query screens: every query is invalidated;
 *   - screens that fetch for themselves: `useLiveVersion()` / `useOnLiveChange()` below tell them
 *     to re-run their loader.
 * Bursts are debounced into one refresh. A hidden tab does nothing until it is looked at again,
 * then catches up once. If the stream drops, it reconnects with backoff and meanwhile falls back
 * to refreshing on focus and every 30s — the old 3-second blind poll this replaces rendered every
 * page for every open tab whether or not anything had changed.
 */

type LiveState = { version: number; models: string[] };
const LiveContext = createContext<LiveState>({ version: 0, models: [] });

/** Increments whenever anything changes. Put it in the deps of an effect that loads data. */
export function useLiveVersion(): number {
  return useContext(LiveContext).version;
}

/** Runs `cb` after each change (not on mount). Use it to re-run a screen's own loader. */
export function useOnLiveChange(cb: () => void) {
  const { version } = useContext(LiveContext);
  const ref = useRef(cb);
  ref.current = cb;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current();
  }, [version]);
}

const DEBOUNCE_MS = 250;
const FALLBACK_POLL_MS = 30_000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [live, setLive] = useState<LiveState>({ version: 0, models: [] });
  const pending = useRef<Set<string>>(new Set());
  const missedWhileHidden = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connected = useRef(false);

  const flush = useCallback(() => {
    timer.current = null;
    if (document.visibilityState !== "visible") {
      missedWhileHidden.current = true;
      return;
    }
    const models = [...pending.current];
    pending.current.clear();
    startTransition(() => router.refresh());
    queryClient.invalidateQueries();
    setLive((prev) => ({ version: prev.version + 1, models }));
    window.dispatchEvent(new CustomEvent("taskboard:change", { detail: { models } }));
  }, [router, queryClient]);

  const schedule = useCallback(
    (models: string[]) => {
      models.forEach((m) => pending.current.add(m));
      if (!timer.current) timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush]
  );

  // The stream itself, with reconnect/backoff.
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      es = new EventSource("/api/stream");
      es.addEventListener("open", () => {
        // Reconnected after a gap: we may have missed changes, so catch up once.
        if (!connected.current && backoff > 1000) schedule(["*"]);
        connected.current = true;
        backoff = 1000;
      });
      es.addEventListener("change", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { models?: string[] };
          schedule(data.models ?? ["*"]);
        } catch {
          schedule(["*"]);
        }
      });
      es.addEventListener("error", () => {
        connected.current = false;
        es?.close();
        es = null;
        if (stopped) return;
        retry = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      });
    };
    open();

    return () => {
      stopped = true;
      es?.close();
      if (retry) clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  // Catch up when a hidden tab is looked at again; fall back to polling while disconnected.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (missedWhileHidden.current) {
        // Real events arrived while the tab was hidden — full refresh needed.
        missedWhileHidden.current = false;
        schedule(["*"]);
      } else if (!connected.current) {
        // Stream reconnecting but no confirmed missed events — soft refresh only.
        // Skipping router.refresh() avoids re-running all layout DB queries on every tab switch.
        queryClient.invalidateQueries();
        setLive((prev) => ({ ...prev, version: prev.version + 1 }));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const poll = setInterval(() => {
      if (!connected.current && document.visibilityState === "visible") schedule(["*"]);
    }, FALLBACK_POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(poll);
    };
  }, [schedule]);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}
