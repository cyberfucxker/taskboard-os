"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Recents — the last 10 records the viewer opened (task, client, project, person, lead).
 * Pure localStorage (`taskboard3_recents`), per browser. Read in an effect so the first
 * render matches the server (hydration-safe); every write fires a window event so the
 * palette, sidebar and Quick Access rail stay in step without a reload.
 */

export type RecentType = "task" | "client" | "project" | "person" | "lead";

export interface RecentItem {
  type: RecentType;
  id: string;
  label: string;
  path: string;
  ts: number;
}

export const RECENTS_KEY = "taskboard3_recents";
export const RECENTS_EVENT = "taskboard3:recents";
const MAX = 10;
const TYPES: RecentType[] = ["task", "client", "project", "person", "lead"];

export function readRecents(): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (r: Partial<RecentItem>) =>
          r &&
          typeof r.id === "string" &&
          typeof r.label === "string" &&
          typeof r.path === "string" &&
          TYPES.includes(r.type as RecentType)
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, "ts">): void {
  try {
    const next = [
      { ...item, ts: Date.now() },
      ...readRecents().filter((r) => !(r.type === item.type && r.id === item.id)),
    ].slice(0, MAX);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENTS_EVENT));
  } catch {
    /* storage blocked — recents are a convenience only */
  }
}

export function useRecents(): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>([]);
  const load = useCallback(() => setItems(readRecents()), []);
  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === RECENTS_KEY) load();
    };
    window.addEventListener(RECENTS_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(RECENTS_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);
  return items;
}
