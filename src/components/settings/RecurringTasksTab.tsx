"use client";

import { useEffect, useState } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { Plus, Trash2, RefreshCw, Clock, CalendarClock } from "lucide-react";
import { useToast } from "@/components/Toast";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];

interface Employee {
  id: string;
  name: string;
}

interface Template {
  id: string;
  title: string;
  description: string | null;
  scheduledDays: string[];
  scheduledTime: string;
  priority: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  assignee: { id: string; name: string } | null;
}

export default function RecurringTasksTab() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI"]);
  const [time, setTime] = useState("09:30");
  const [priority, setPriority] = useState("P2");
  const [assigneeId, setAssigneeId] = useState("");
  const [subtasksText, setSubtasksText] = useState("");

  useOnLiveChange(() => { load(); });

  useEffect(() => {
    load();
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setEmployees(d.employees); })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-tasks");
      const data = await res.json();
      if (data.ok) setTemplates(data.data);
    } catch {
      toast("Failed to load recurring task templates", "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleDay(d: string) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function createTemplate() {
    if (!title.trim() || days.length === 0) {
      toast("Title and at least one day are required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledDays: days,
          scheduledTime: time,
          priority,
          assigneeId: assigneeId || undefined,
          subtasks: subtasksText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Recurring task template created", "success");
        setTitle("");
        setDescription("");
        setSubtasksText("");
        await load();
      } else {
        toast(data.error || "Failed to create template", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: Template) {
    const res = await fetch("/api/recurring-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, isActive: !t.isActive }),
    });
    const data = await res.json();
    if (data.ok) {
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, isActive: !x.isActive } : x)));
    } else {
      toast(data.error || "Failed to update template", "error");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this recurring task template? This does not delete tasks it already created.")) return;
    const res = await fetch(`/api/recurring-tasks?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setTemplates((prev) => prev.filter((x) => x.id !== id));
      toast("Template deleted", "success");
    } else {
      toast(data.error || "Failed to delete template", "error");
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-teal" /> Recurring Task Templates
          </h2>
          <p className="text-[13px] text-muted mt-1">
            Real, working recurring tasks — a server job runs once every morning (06:00) and creates
            a real task from every active template scheduled for that day. Safe to run more than once;
            it never creates a duplicate for the same day.
          </p>
        </div>
      </div>

      {/* Create form */}
      <div className="rounded-xl border border-hover bg-bg p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title, e.g. Daily SEO ranking check"
            className="rounded-lg bg-raised border border-hover px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-teal"
          />
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-lg bg-raised border border-hover px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-teal"
          >
            <option value="">Unassigned (goes to admin queue)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded-lg bg-raised border border-hover px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-teal resize-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-muted uppercase mr-1">Days</span>
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                days.includes(d)
                  ? "bg-teal border-teal text-white"
                  : "bg-raised border-hover text-muted hover:text-ink"
              }`}
            >
              {d}
            </button>
          ))}
          <span className="text-[11px] font-bold text-muted uppercase ml-3 mr-1">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-lg bg-raised border border-hover px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-teal"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <span className="text-[11px] font-bold text-muted uppercase ml-3 mr-1">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg bg-raised border border-hover px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-teal"
          />
        </div>
        <textarea
          value={subtasksText}
          onChange={(e) => setSubtasksText(e.target.value)}
          placeholder={"Subtasks, one per line (optional)\ne.g.\nCheck rankings\nUpdate spreadsheet"}
          rows={2}
          className="w-full rounded-lg bg-raised border border-hover px-3 py-2 text-[12px] text-ink font-mono focus:outline-none focus:border-teal resize-none"
        />
        <button
          onClick={createTemplate}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-teal hover:bg-tealhi text-white transition disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {saving ? "Creating..." : "Create Template"}
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-muted uppercase">Templates ({templates.length})</span>
          <button onClick={load} className="text-[11px] text-tealhi hover:underline flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-[13px] text-muted">Loading...</p>
        ) : templates.length === 0 ? (
          <p className="text-[13px] text-muted">No recurring templates yet.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-hover bg-bg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink truncate">{t.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-raised border border-hover text-muted">{t.priority}</span>
                  {!t.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/10 text-amber border border-amber/25">Paused</span>
                  )}
                </div>
                <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                  <Clock className="h-3 w-3" /> {t.scheduledTime} · {t.scheduledDays.join(", ")}
                  {t.assignee && <span>· {t.assignee.name}</span>}
                  {t.lastTriggeredAt && <span>· last created {new Date(t.lastTriggeredAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(t)}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-hover text-muted hover:text-ink hover:border-teal/50 transition"
                >
                  {t.isActive ? "Pause" : "Activate"}
                </button>
                <button
                  onClick={() => remove(t.id)}
                  className="p-1.5 rounded-md border border-hover text-muted hover:text-crimson hover:border-crimson/25 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
