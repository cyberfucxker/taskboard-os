"use client";

import { useCallback, useEffect, useState } from "react";
import { useUniversalTimer } from "@/components/timer/TimerContext";
import { WorkloadMeter } from "@/components/workload/WorkloadMeter";
import type { MyWorkloadPayload } from "@/lib/workload-core";

/**
 * Self-contained "Workload today" block for the Today page. Fetches the caller's own
 * workload (read-only) after mount, and again whenever the running task / focus block
 * changes. Renders a fixed-height skeleton first, so there is no layout jump and no
 * hydration difference (no clock or locale in render).
 */
export function WorkloadSection({ children, onPlanChanged }: { children?: React.ReactNode; onPlanChanged?: () => void } = {}) {
  const { runningTask, focusBlock } = useUniversalTimer();
  const [data, setData] = useState<MyWorkloadPayload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workload?scope=me", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) { setData({ workload: json.workload, tasks: json.tasks, inProgress: json.inProgress }); setFailed(false); }
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  const runningId = runningTask?.taskId ?? null;
  const blockId = focusBlock?.id ?? null;
  useEffect(() => { void load(); }, [load, runningId, blockId]);

  if (failed && !data) return null; // never shout about a read-only helper
  if (!data) return <div aria-hidden className="h-44 animate-pulse rounded-[10px] border border-edge bg-surface" />;
  return <WorkloadMeter workload={data.workload} tasks={data.tasks} onChanged={() => { void load(); onPlanChanged?.(); }}>{children}</WorkloadMeter>;
}
