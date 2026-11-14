"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Favorites — pinned records/views, `taskboard3_favs` = JSON array of {label, path}.
 * The Sidebar's Favorites section reads the same key. Hydration-safe (read in an
 * effect) and live: any toggle fires a window event.
 */

export interface FavItem {
  label: string;
  path: string;
}

export const FAVS_KEY = "taskboard3_favs";
export const FAVS_EVENT = "taskboard3:favs";
const MAX = 30;

export function readFavs(): FavItem[] {
  try {
    const raw = window.localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (f: Partial<FavItem>) => f && typeof f.label === "string" && typeof f.path === "string"
    );
  } catch {
    return [];
  }
}

function writeFavs(list: FavItem[]): void {
  try {
    window.localStorage.setItem(FAVS_KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event(FAVS_EVENT));
  } catch {
    /* ignore */
  }
}

export function toggleFav(item: FavItem): boolean {
  const list = readFavs();
  const has = list.some((f) => f.path === item.path);
  writeFavs(has ? list.filter((f) => f.path !== item.path) : [item, ...list]);
  return !has;
}

export function useFavorites(): FavItem[] {
  const [items, setItems] = useState<FavItem[]>([]);
  const load = useCallback(() => setItems(readFavs()), []);
  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVS_KEY) load();
    };
    window.addEventListener(FAVS_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FAVS_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);
  return items;
}
