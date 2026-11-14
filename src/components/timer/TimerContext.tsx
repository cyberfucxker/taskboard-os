"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { FocusEndSheet } from "@/components/timer/FocusEndSheet";
import { MAX_BLOCK_TASKS } from "@/lib/focus-clock";
import { useWipGuard } from "@/components/workload/useWipGuard"; // Lane I: soft WIP guard
import type { TodayStatus } from "@/lib/time";
import type { EndChoice, FocusBlockView } from "@/lib/focus";

interface RunningTask {
  taskId: string;
  code: string;
  title: string;
  category: string;
  startedAtMs: number;
}

/**
 * Why the ordinary Start/Pause actions are waiting on an answer. T8: a focus block owns
 * one open timer, so touching an unrelated task has to end the block first — but that is
 * a decision, not a side effect, so it goes through the end sheet.
 */
type PendingBlockAction = { kind: "end" } | { kind: "start"; taskId: string } | null;

interface TimerContextValue {
  status: TodayStatus | null;
  runningTask: RunningTask | null;
  focusBlock: FocusBlockView | null;
  isShiftPaused: boolean;
  shiftPauseReason: string | null;
  shiftPausedAt: string | null;
  loading: boolean;
  toggleShiftPause: (action: "pause" | "resume", reason?: string) => Promise<boolean>;
  startTask: (taskId: string) => Promise<boolean>;
  pauseTask: (taskId?: string, reason?: string) => Promise<boolean>;
  startFocusBlock: (taskIds: string[]) => Promise<boolean>;
  switchFocusTask: (taskId: string) => Promise<boolean>;
  endFocusBlock: (choices?: Record<string, EndChoice> | null) => Promise<boolean>;
  requestEndBlock: () => void;
  refresh: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [focusBlock, setFocusBlock] = useState<FocusBlockView | null>(null);
  const [pending, setPending] = useState<PendingBlockAction>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Status and the open block always travel together — the chip must never claim a
      // block is running while the timer it points at has already stopped.
      const [statusRes, focusRes] = await Promise.all([
        fetch("/api/me/status", { cache: "no-store" }),
        fetch("/api/focus", { cache: "no-store" }),
      ]);
      if (statusRes.ok) {
        const json = await statusRes.json();
        if (json?.ok && json.status) {
          setStatus(json.status);
        }
      }
      if (focusRes.ok) {
        const json = await focusRes.json();
        if (json?.ok) setFocusBlock(json.block ?? null);
      }
    } catch {
      // Best-effort poll
    }
  }, []);

  // Realtime: a timer started/stopped in another tab or by a teammate's action shows at once.
  useOnLiveChange(() => { refresh(); });

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 25_000);
    
    // Refresh when tab gains focus
    const onFocus = () => { refresh(); };
    window.addEventListener("focus", onFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const toggleShiftPause = useCallback(async (action: "pause" | "resume", reason?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/time/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason ?? (action === "pause" ? "Break / Pause" : undefined) }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(action === "pause" ? "Shift paused · On break" : "Shift resumed · Welcome back!", "success");
        await refresh();
        router.refresh();
        return true;
      } else {
        toast(data.error ?? "Failed to toggle shift state", "error");
        return false;
      }
    } catch {
      toast("Error toggling shift pause", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [refresh, router, toast]);

  const switchFocusTask = useCallback(async (taskId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch", taskId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFocusBlock(data.block);
        const moved = data.block.tasks.find((t: any) => t.id === taskId);
        toast(`Focus · ${moved?.code ?? "task"} is running`, "success");
        await refresh();
        router.refresh();
        return true;
      } else {
        toast(data.error ?? "Could not switch focus task", "error");
        return false;
      }
    } catch {
      toast("Error switching focus task", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [refresh, router, toast]);

  // Lane I: soft WIP guard (assigned below once startFocusBlock exists). Fails open.
  const wipGuardRef = useRef<(taskId: string) => Promise<boolean>>(async () => true);

  /** The plain per-task Start, unchanged from before T8. */
  const doStartTask = useCallback(async (taskId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Task started · Timer running", "success");
        await refresh();
        router.refresh();
        return true;
      } else {
        toast(data.error ?? "Could not start task", "error");
        return false;
      }
    } catch {
      toast("Error starting task", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [refresh, router, toast]);

  /**
   * Start, with the block rules applied first:
   *  - a task already in the block just takes the timer (switching, not restarting);
   *  - any other task means the block has to end, so ask instead of silently tearing
   *    three tasks' statuses down.
   */
  const startTask = useCallback(async (taskId: string) => {
    if (focusBlock) {
      if (focusBlock.taskIds.includes(taskId)) return switchFocusTask(taskId);
      setPending({ kind: "start", taskId });
      return false;
    }
    if (!(await wipGuardRef.current(taskId))) return false; // Lane I: 4th in-progress task -> park / focus block / start anyway
    return doStartTask(taskId);
  }, [focusBlock, switchFocusTask, doStartTask]);

  const startFocusBlock = useCallback(async (taskIds: string[]) => {
    if (taskIds.length < 1 || taskIds.length > MAX_BLOCK_TASKS) {
      toast(`A focus block holds 1-${MAX_BLOCK_TASKS} tasks.`, "error");
      return false;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", taskIds }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFocusBlock(data.block);
        toast(`Focus block started · ${data.block.tasks.length} tasks`, "success");
        await refresh();
        router.refresh();
        return true;
      } else {
        toast(data.error ?? "Could not start focus block", "error");
        return false;
      }
    } catch {
      toast("Error starting focus block", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [refresh, router, toast]);

  const { guard: wipGuard, dialog: wipDialog } = useWipGuard({ startFocusBlock, runningTaskId: status?.running?.taskId ?? null });
  wipGuardRef.current = wipGuard;

  const endFocusBlock = useCallback(async (choices?: Record<string, EndChoice> | null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", choices: choices ?? undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFocusBlock(null);
        toast("Focus block ended", "success");
        await refresh();
        router.refresh();
        return true;
      } else {
        toast(data.error ?? "Could not end focus block", "error");
        return false;
      }
    } catch {
      toast("Error ending focus block", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [refresh, router, toast]);

  const requestEndBlock = useCallback(() => { setPending({ kind: "end" }); }, []);

  const doPauseTask = useCallback(async (taskId?: string, reason?: string) => {
    setLoading(true);
    try {
      const targetId = taskId ?? "current";
      const res = await fetch(`/api/tasks/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", reason }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Task paused · Time logged", "success");
        await refresh();
        router.refresh();
        return true;
      } else {
        toast(data.error ?? "Could not pause task", "error");
        return false;
      }
    } catch {
      toast("Error pausing task", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [refresh, router, toast]);

  // Pausing stops the one timer a block owns, so it ends the block through the sheet
  // rather than closing a session behind the block's back.
  const pauseTask = useCallback(async (taskId?: string, reason?: string) => {
    if (focusBlock) {
      setPending({ kind: "end" });
      return false;
    }
    return doPauseTask(taskId, reason);
  }, [focusBlock, doPauseTask]);

  const confirmPending = useCallback(async (choices: Record<string, EndChoice>) => {
    const action = pending;
    setPending(null);
    if (!action) return;
    const ended = await endFocusBlock(choices);
    if (!ended) return;
    if (action.kind === "start") await doStartTask(action.taskId);
  }, [pending, endFocusBlock, doStartTask]);

  const runningTask: RunningTask | null = status?.running ? {
    taskId: status.running.taskId,
    code: status.running.code,
    title: status.running.title,
    category: status.running.category,
    startedAtMs: status.running.startedAtMs,
  } : null;

  return (
    <TimerContext.Provider
      value={{
        status,
        runningTask,
        focusBlock,
        isShiftPaused: status?.isShiftPaused ?? false,
        shiftPauseReason: status?.shiftPauseReason ?? null,
        shiftPausedAt: status?.shiftPausedAt ?? null,
        loading,
        toggleShiftPause,
        startTask,
        pauseTask,
        startFocusBlock,
        switchFocusTask,
        endFocusBlock,
        requestEndBlock,
        refresh,
      }}
    >
      {children}
      {wipDialog}
      {pending && focusBlock && (
        <FocusEndSheet
          block={focusBlock}
          title={pending.kind === "start" ? "End focus block first?" : "End focus block?"}
          subtitle={
            pending.kind === "start"
              ? "You are starting a different task. End this focus block and set an outcome for each of its tasks first."
              : "The block timer stops here. Set an outcome for each task in the block."
          }
          busy={loading}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </TimerContext.Provider>
  );
}

export function useUniversalTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) {
    throw new Error("useUniversalTimer must be used within a TimerProvider");
  }
  return ctx;
}