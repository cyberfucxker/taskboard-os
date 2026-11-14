"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play } from "lucide-react";

/** Today's IST date: "08 Oct" for the title, yyyy-mm-dd for the due date. */
function istToday() {
  const now = new Date();
  const label = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
  const key = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return { label, key };
}

/**
 * Start (or resume) a routine. Creates today's routine task assigned to me and
 * due today if it does not exist yet, then starts its timer.
 */
export function RoutineButton({
  streamTitle, category, taskId, userId,
}: { streamTitle: string; category: string; taskId: string | null; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      let id = taskId;
      if (!id) {
        const { label, key } = istToday();
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Routine: ${streamTitle} — ${label}`,
            category,
            priority: "P2",
            assigneeId: userId,
            dueDate: key,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok || !json.task?.id) throw new Error(json?.error ?? "Could not create the routine task");
        id = json.task.id as string;
      }
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? "Could not start the timer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <span className="flex flex-none items-center gap-2">
      {err && <span role="alert" className="text-[12px] text-crimson">{err}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
      >
        <Play size={14} aria-hidden /> {taskId ? "Resume" : "Start"}
      </button>
    </span>
  );
}
