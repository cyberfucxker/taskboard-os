"use client";

/**
 * Optimistic overlay for task rows. mutate(id, patch, run) shows `patch`
 * immediately, awaits the real request, and rolls the patched fields back with
 * a toast when it fails. The overlay is dropped as soon as the server data
 * (arriving through router.refresh / the realtime stream) matches it, or after
 * 20 seconds, so it can never mask the truth for long.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import type { TaskView } from "@/components/tasks/types";
import type { MutationResult } from "./mutations";

type Patch = Partial<TaskView>;
interface Entry {
  patch: Patch;
  at: number;
}

const EXPIRE_MS = 20_000;
// Fields that decide whether the server has caught up with the overlay.
const CHECK_KEYS: (keyof TaskView)[] = ["status", "priority", "dueDate", "assigneeId", "title", "description"];

function same(key: keyof TaskView, a: unknown, b: unknown): boolean {
  if (key === "dueDate") return String(a ?? "").slice(0, 10) === String(b ?? "").slice(0, 10);
  return (a ?? null) === (b ?? null);
}

export function useOptimisticTasks(source: TaskView[]) {
  const toast = useToast();
  const [over, setOver] = useState<Record<string, Entry>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drop overlays the server has caught up with (or that are too old).
  useEffect(() => {
    if (Object.keys(over).length === 0) return;
    const byId = new Map(source.map((t) => [t.id, t]));
    const now = Date.now();
    let changed = false;
    const next: Record<string, Entry> = {};
    for (const [id, e] of Object.entries(over)) {
      const t = byId.get(id);
      const caughtUp = t
        ? (Object.keys(e.patch) as (keyof TaskView)[]).filter((k) => CHECK_KEYS.includes(k)).every((k) => same(k, t[k], e.patch[k]))
        : true;
      if (!t || caughtUp || now - e.at > EXPIRE_MS) changed = true;
      else next[id] = e;
    }
    if (changed) setOver(next);
    else {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setOver((p) => ({ ...p })), EXPIRE_MS + 250);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [source, over]);

  const tasks = useMemo(
    () => (Object.keys(over).length === 0 ? source : source.map((t) => (over[t.id] ? { ...t, ...over[t.id].patch } : t))),
    [source, over]
  );

  const mutate = useCallback(
    async (id: string, patch: Patch, run: () => Promise<MutationResult>, okMessage?: string): Promise<boolean> => {
      setOver((p) => ({ ...p, [id]: { patch: { ...(p[id]?.patch ?? {}), ...patch }, at: Date.now() } }));
      const r = await run();
      if (!r.ok) {
        setOver((p) => {
          const cur = p[id];
          if (!cur) return p;
          const rest = { ...cur.patch };
          for (const k of Object.keys(patch)) delete (rest as Record<string, unknown>)[k];
          const n = { ...p };
          if (Object.keys(rest).length === 0) delete n[id];
          else n[id] = { ...cur, patch: rest };
          return n;
        });
        toast(r.error ?? "Update failed", "error");
        return false;
      }
      if (okMessage) toast(okMessage, "success");
      return true;
    },
    [toast]
  );

  return { tasks, mutate };
}
