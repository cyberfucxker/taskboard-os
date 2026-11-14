"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, ListOrdered, Pause, Play, Check, GripVertical } from "lucide-react";
import type { TodayStatus } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function hm(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const BTN =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]";

/** Band 1 of TaskBoard 3 Today: what I'm on now, what's next, how my day is going. */
export function NowBand({ init }: { init: TodayStatus }) {
  const router = useRouter();
  const running = init.running;
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const upNext = init.recentlyWorked.filter((r) => !r.isRunning && r.status !== "DONE").slice(0, 3);
  const logged = init.loggedMs + (running ? now - mountedAt : 0);
  const goal = init.goalMs || 8 * 3600 * 1000;
  const pct = Math.min(100, Math.round((logged / goal) * 100));

  async function act(taskId: string, action: "pause" | "start", skipRefresh?: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.ok === false)) setErr(data?.error ?? "Could not update the timer");
    } catch {
      setErr("Network problem. Try again.");
    } finally {
      setBusy(false);
      if (!skipRefresh) router.refresh();
    }
  }

  return (
    <section aria-label="Right now" className="grid grid-cols-1 overflow-hidden rounded-[10px] border border-line md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div
        className={`flex min-w-0 flex-col gap-1.5 border-b border-line p-4 md:border-b-0 md:border-r transition-colors ${dragOver ? "ring-1 ring-inset ring-[var(--teal)]" : ""}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const droppedId = e.dataTransfer.getData("taskId");
          if (!droppedId || busy) return;
          if (running) {
            await act(running.taskId, "pause", true);
          }
          await act(droppedId, "start");
        }}
      >
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
          {running && <span aria-hidden className="h-2 w-2 rounded-full bg-emerald" />}
          {running ? "Working on" : dragOver ? "Drop to start" : "No timer running"}
        </p>
        {running ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <span className="font-mono text-[22px] font-medium tabular-nums text-ink" suppressHydrationWarning>
                {clock(now - running.startedAtMs)}
              </span>
              <Link href={`/tasks/${running.taskId}`} className="min-w-0 truncate text-[14px] font-medium text-ink hover:text-tealhi">
                <span className="mr-1.5 font-mono text-[12px] text-muted">{running.code}</span>
                {running.title}
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button type="button" className={BTN} disabled={busy} onClick={() => act(running.taskId, "pause")}>
                <Pause size={14} aria-hidden /> Pause
              </button>
              <Link href={`/tasks/${running.taskId}`} className={BTN}>
                <Check size={14} aria-hidden /> Finish
              </Link>
            </div>
          </>
        ) : upNext[0] ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button type="button" className={BTN} disabled={busy} onClick={() => act(upNext[0].id, "start")}>
              <Play size={14} aria-hidden /> Start {upNext[0].code}
            </button>
            <span className="min-w-0 truncate text-[13px] text-ink2">{upNext[0].title}</span>
          </div>
        ) : (
          <p className="text-[13px] text-ink2">Nothing assigned yet. Press C to create a task.</p>
        )}
        {err && <p role="alert" className="text-[12px] text-crimson">{err}</p>}
      </div>

      <div className="flex min-w-0 flex-col gap-1 border-b border-line p-4 md:border-b-0 md:border-r">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
          <ListOrdered size={14} aria-hidden /> Up next
        </p>
        {upNext.length === 0 ? (
          <p className="text-[13px] text-muted">Your list is clear.</p>
        ) : (
          upNext.map((t, i) => (
            <div
              key={t.id}
              draggable
              role="link"
              tabIndex={0}
              onDragStart={(e) => {
                e.dataTransfer.setData("taskId", t.id);
                e.dataTransfer.setData("taskCode", t.code);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => router.push(`/tasks/${t.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") router.push(`/tasks/${t.id}`); }}
              className="group flex min-h-[28px] min-w-0 cursor-grab items-center gap-2 text-[13px] text-ink hover:text-tealhi active:cursor-grabbing"
            >
              <GripVertical size={12} className="shrink-0 text-faint opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
              <span className="font-mono text-[12px] text-muted">{i + 1}</span>
              <span className="font-mono text-[12px] text-muted">{t.code}</span>
              <span className="truncate">{t.title}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 p-4">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
          <Clock size={14} aria-hidden /> My day
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-[20px] font-semibold tabular-nums text-ink" suppressHydrationWarning>{hm(logged)}</span>
          <span className="text-[13px] text-muted">of {Math.round(goal / 3600000)}h logged</span>
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Hours logged today">
          <div className="h-full rounded-full bg-[var(--teal)]" style={{ width: `${pct}%` }} suppressHydrationWarning />
        </div>
        <Link href="/time" className="text-[12px] text-muted hover:text-tealhi">Time log &rarr;</Link>
      </div>
    </section>
  );
}
