"use client";

import { useCallback, useRef, useState, type ReactElement } from "react";
import { WIP_LIMIT } from "@/lib/workload-core";
import { WipGuardDialog, type WipTask } from "@/components/workload/WipGuardDialog";

interface Pending { taskId: string; inProgress: WipTask[] }

/**
 * Soft WIP guard for the client "start task" paths.
 *
 *   const { guard, dialog } = useWipGuard({ startFocusBlock, runningTaskId });
 *   ...
 *   if (!(await guard(taskId))) return false;   // false = the person chose another way out
 *   ...render {dialog} once...
 *
 * guard() resolves true when starting may go ahead (under the limit, already one of the
 * in-progress tasks, parked one, chose "Start anyway", or the check itself failed - it fails
 * OPEN) and false when the person cancelled or started a focus block instead.
 * Only reads /api/workload (no writes) until the person taps Park, which uses the existing
 * task status API. Nothing is blocked server-side.
 */
export function useWipGuard(opts: {
  /** Provide to offer "Start focus block with up to 3 of them". */
  startFocusBlock?: (taskIds: string[]) => Promise<boolean>;
  /** The task whose timer is running now (parking it must also stop its clock -> uses the pause action). */
  runningTaskId?: string | null;
} = {}): { guard: (taskId: string) => Promise<boolean>; dialog: ReactElement } {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const resolver = useRef<((go: boolean) => void) | null>(null);

  const finish = useCallback((go: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setPending(null);
    setBusyId(null);
    r?.(go);
  }, []);

  const guard = useCallback(async (taskId: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/workload?scope=me", { cache: "no-store" });
      if (!res.ok) return true;
      const data = await res.json();
      const list: WipTask[] = Array.isArray(data?.inProgress) ? data.inProgress : [];
      if (list.some((t) => t.id === taskId) || list.length < WIP_LIMIT) return true;
      return await new Promise<boolean>((resolve) => {
        resolver.current?.(false); // a stale prompt never stays pending
        resolver.current = resolve;
        setPending({ taskId, inProgress: list });
      });
    } catch {
      return true;
    }
  }, []);

  const park = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const running = opts.runningTaskId === id;
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Existing status API (back to TODO). The running task goes through "pause" so its clock stops.
        body: JSON.stringify(running ? { action: "pause" } : { action: "status", status: "TODO" }),
      });
      if (!res.ok) { setBusyId(null); return; }
      const left = (pending?.inProgress ?? []).filter((t) => t.id !== id);
      if (pending && left.length < WIP_LIMIT) { finish(true); return; }
      if (pending) setPending({ ...pending, inProgress: left });
      setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }, [opts.runningTaskId, pending, finish]);

  const focus = opts.startFocusBlock;
  const dialog = (
    <WipGuardDialog
      open={pending !== null}
      inProgress={pending?.inProgress ?? []}
      busyId={busyId}
      onPark={park}
      onFocusBlock={focus ? async (ids) => { await focus(ids); finish(false); } : undefined}
      onStartAnyway={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );
  return { guard, dialog };
}
