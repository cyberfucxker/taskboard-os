"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Edit2, Check, Clock, AlertCircle, Sparkles, RefreshCw } from "lucide-react";
import { useToast } from "@/components/Toast";

export interface RecurringTemplate {
  id: string;
  title: string;
  description: string | null;
  frequency: string;
  scheduledDays: string[];
  scheduledTime: string;
  priority: "P0" | "P1" | "P2" | "P3";
  departmentName?: string | null;
  assigneeId?: string | null;
  isActive: boolean;
  canEdit?: boolean;
}

const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

interface ManageRoutinesModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ManageRoutinesModal({ open, onClose, onUpdated }: ManageRoutinesModalProps) {
  const toast = useToast();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("DAILY");
  const [scheduledDays, setScheduledDays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI"]);
  const [scheduledTime, setScheduledTime] = useState("09:30");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2" | "P3">("P2");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-tasks");
      const data = await res.json();
      if (res.ok && data.ok) {
        setTemplates(data.data || []);
      }
    } catch {
      toast("Failed to load routine templates", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      fetchTemplates();
      setIsCreating(false);
      setEditingTemplate(null);
      setErrorMsg(null);
    }
  }, [open]);

  function startCreate() {
    setEditingTemplate(null);
    setTitle("");
    setDescription("");
    setFrequency("DAILY");
    setScheduledDays(["MON", "TUE", "WED", "THU", "FRI"]);
    setScheduledTime("09:30");
    setPriority("P2");
    setIsActive(true);
    setIsCreating(true);
    setErrorMsg(null);
  }

  function startEdit(t: RecurringTemplate) {
    setIsCreating(false);
    setEditingTemplate(t);
    setTitle(t.title);
    setDescription(t.description || "");
    setFrequency(t.frequency || "DAILY");
    setScheduledDays(Array.isArray(t.scheduledDays) ? t.scheduledDays : ["MON", "TUE", "WED", "THU", "FRI"]);
    setScheduledTime(t.scheduledTime || "09:30");
    setPriority(t.priority || "P2");
    setIsActive(t.isActive !== false);
    setErrorMsg(null);
  }

  function toggleDay(day: string) {
    setScheduledDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Routine title is required.");
      return;
    }
    if (scheduledDays.length === 0) {
      setErrorMsg("Please select at least one scheduled day.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      frequency,
      scheduledDays,
      scheduledTime,
      priority,
      isActive,
    };

    try {
      if (editingTemplate) {
        const res = await fetch("/api/recurring-tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingTemplate.id, ...payload }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          toast("Routine updated ✓", "success");
          setEditingTemplate(null);
          setIsCreating(false);
          fetchTemplates();
          onUpdated();
        } else {
          setErrorMsg(data.error || "Failed to update routine");
        }
      } else {
        const res = await fetch("/api/recurring-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          toast("Routine template created ✓", "success");
          setIsCreating(false);
          fetchTemplates();
          onUpdated();
        } else {
          setErrorMsg(data.error || "Failed to create routine");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this routine template?")) return;
    try {
      const res = await fetch(`/api/recurring-tasks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Routine deleted ✓", "success");
        fetchTemplates();
        onUpdated();
      } else {
        toast(data.error || "Failed to delete routine", "error");
      }
    } catch {
      toast("Failed to delete routine", "error");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm anim-fade"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-edge bg-raised p-6 shadow-2xl anim-up text-ink"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hover pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/15 text-tealhi">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-ink">Manage My Routine Templates</h2>
              <p className="text-[12px] text-muted">
                Customize, add, or schedule your daily recurring work routines.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isCreating || editingTemplate ? (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div className="flex items-center justify-between bg-surface border border-edge rounded-lg p-2.5">
              <span className="text-[13px] font-semibold text-teal">
                {editingTemplate ? `Editing: ${editingTemplate.title}` : "Create New Routine Template"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingTemplate(null);
                }}
                className="text-[12px] text-muted hover:text-ink"
              >
                ← Back to List
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 p-2.5 text-[12.5px] text-crimson font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="label mb-1.5 block text-ink">
                Routine Title <span className="text-crimson">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Daily Standup & Sprint Blocker Review"
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label mb-1.5 block text-ink">Standard Execution Scope / Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Default SOP / steps when executing this routine..."
                className="w-full rounded-md border border-edge bg-bg p-2.5 text-[13px] text-ink focus:border-teal focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label mb-1.5 block text-ink">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>

              <div>
                <label className="label mb-1.5 block text-ink">Scheduled Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                />
              </div>

              <div>
                <label className="label mb-1.5 block text-ink">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                >
                  <option value="P0">P0 — Urgent</option>
                  <option value="P1">P1 — High</option>
                  <option value="P2">P2 — Normal</option>
                  <option value="P3">P3 — Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label mb-1.5 block text-ink">Scheduled Days</label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map((d) => {
                  const active = scheduledDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`rounded border px-2.5 py-1 text-[11.5px] font-mono font-medium transition ${
                        active
                          ? "border-teal bg-teal/15 text-teal font-bold"
                          : "border-edge bg-bg text-muted hover:text-ink"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-hover pt-3.5">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingTemplate(null);
                }}
                className="rounded-md border border-hover px-3.5 py-1.5 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-teal px-4 py-1.5 text-[13px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-40 shadow-sm"
              >
                {submitting ? "Saving..." : editingTemplate ? "Update Routine" : "Create Routine"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">
                {templates.length} routine {templates.length === 1 ? "template" : "templates"} configured
              </span>
              <button
                type="button"
                onClick={startCreate}
                className="flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:bg-tealhi transition shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Routine Template</span>
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-[13px] text-muted">Loading routine templates...</div>
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-edge p-6 text-center">
                <p className="text-[13px] text-muted">You have no custom routine templates yet.</p>
                <button
                  type="button"
                  onClick={startCreate}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-teal/15 px-3.5 py-1.5 text-[12.5px] font-medium text-tealhi hover:bg-teal/25 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Your First Routine</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-bg p-3 transition hover:border-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-ink truncate">{t.title}</span>
                        <span className="rounded bg-surface border border-edge px-1.5 py-0.2 text-[10px] font-mono text-muted">
                          {t.priority}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        <Clock className="h-3 w-3" />
                        <span>{t.scheduledTime}</span>
                        <span>·</span>
                        <span>{t.scheduledDays?.join(", ") || "Daily"}</span>
                      </div>
                      {t.description && (
                        <p className="mt-1 text-[12px] text-muted line-clamp-1">{t.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {t.canEdit !== false && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            className="rounded p-1.5 text-muted hover:bg-hover hover:text-ink transition"
                            title="Edit Routine"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id)}
                            className="rounded p-1.5 text-muted hover:bg-crimson/10 hover:text-crimson transition"
                            title="Delete Routine"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
