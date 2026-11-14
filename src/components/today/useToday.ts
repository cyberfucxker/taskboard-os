"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TodayStatus } from "@/lib/time";

/**
 * Live status hook for the Today page + header stripe + check-in.
 * Fetches /api/me/status, polls every 60s, and refreshes on demand
 * (after start/pause/log-hours/check-in answer).
 */
export function useToday(init?: TodayStatus) {
  const [status, setStatus] = useState<TodayStatus | null>(init ?? null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(Date.now());
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/status", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.ok && json.status) {
          setStatus(json.status);
          setLastFetchedAt(Date.now());
        }
      }
    } catch {
      // ignore — next poll covers it
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 60_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  return { status, lastFetchedAt, loading, refresh };
}
