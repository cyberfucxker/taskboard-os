"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "SCREENING", label: "Screening" },
  { value: "BUG_FIX", label: "Bug fix" },
  { value: "DEVELOPMENT", label: "Development" },
  { value: "DESIGN", label: "Design" },
  { value: "CRM", label: "CRM" },
  { value: "ADMIN", label: "Admin" },
  { value: "DOCUMENTATION", label: "Documentation" },
  { value: "OTHER", label: "Other" },
];

/**
 * "Log hours" modal — manual hours for on-task (TimeLog) or off-task
 * (ManualTimeLog) work. Shift-aware: only counts within 09:30–18:30
 * minus lunch; after-hours requires an on-task entry with outcome.
 */
export function LogHoursModal({
  myTasks,
  onClose,
  onSaved,
}: {
  myTasks: { id: string; code: string; title: string; category: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"task" | "off">("task");
  const [taskId, setTaskId] = useState<string>(myTasks[0]?.id ?? "");
  const [hours, setHours] = useState("1");
  // Hydration-safe: server and client render "" identically, real date set after mount (T2).
  // IST-correct (T2 follow-up): fixed +05:30 mirror of istDateKey(src/lib/time.ts), kept local
  // so this client modal never value-imports @/lib/time (which pulls @/lib/db into the browser bundle).
  const [date, setDate] = useState("");
  useEffect(() => {
    const s = new Date(Date.now() + 5.5 * 3600 * 1000);
    const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(s.getUTCDate()).padStart(2, "0");
    setDate(`${s.getUTCFullYear()}-${mm}-${dd}`);
  }, []);
  const [startTime, setStartTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const defaultStart = useMemo(() => {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000); // IST-ish
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (!startTime || startTime === "10:00") setStartTime(defaultStart);
  }, [defaultStart, startTime]);

  const submit = async () => {
    const h = parseFloat(hours);
    if (!h || h < 0.25) return toast("Enter at least 0.25h", "error");
    setSaving(true);
    try {
      const res = await fetch("/api/time/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: mode === "task" ? taskId || null : null,
          hours: h,
          date,
          startTime,
          note: note || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast(json?.error ?? "Couldn't log hours", "error");
        return;
      }
      toast(`Logged ${h}h`, "success");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-hover bg-bg p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Log hours</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        {/* mode toggle */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-raised p-1">
          {([["task", "Logged on a task"], ["off", "Off-task / general"]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={cn("rounded-md px-2 py-1.5 text-[12px] transition", mode === v ? "bg-raised text-ink" : "text-muted")}
            >
              {l}
            </button>
          ))}
        </div>

        {mode === "task" && (
          <div className="mb-3">
            <label className="label mb-1 block">Task</label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full rounded-md border border-hover bg-raised px-2 py-1.5 text-[13px] text-ink"
            >
              {myTasks.length === 0 && <option value="">No tasks assigned</option>}
              {myTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.code} — {t.title}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="label mb-1 block">Hours</label>
            <input
              type="number" step="0.25" min="0.25" max="24" value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-md border border-hover bg-raised px-2 py-1.5 text-[13px] text-ink"
            />
          </div>
          <div>
            <label className="label mb-1 block">Date</label>
            <input
              type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-hover bg-raised px-2 py-1.5 text-[13px] text-ink"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="label mb-1 block">Start time (IST) — counts within 09:30–18:30, lunch 13:30–14:10 excluded</label>
          <input
            type="time" value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-md border border-hover bg-raised px-2 py-1.5 text-[13px] text-ink"
          />
        </div>

        <div className="mb-4">
          <label className="label mb-1 block">Note</label>
          <input
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it?"
            className="w-full rounded-md border border-hover bg-raised px-2 py-1.5 text-[13px] text-ink"
          />
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-teal px-3 py-2 text-[13px] font-semibold text-white hover:bg-tealhi disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Log {hours}h
        </button>
      </div>
    </div>
  );
}