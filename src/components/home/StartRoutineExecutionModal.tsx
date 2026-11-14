"use client";

import { useState, useEffect } from "react";
import { X, Play, Clock, FolderGit2, AlertCircle, CheckCircle2, Sparkles, Tag, ArrowRight } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { RecurringTemplate } from "./ManageRoutinesModal";

interface Project {
  id: string;
  name: string;
  code?: string | null;
  client?: { name: string } | null;
}

interface AssignedTask {
  id: string;
  code?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  departmentName?: string | null;
  category?: string | null;
}

interface StartRoutineExecutionModalProps {
  open: boolean;
  template: RecurringTemplate | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "DEV", label: "Development / Engineering" },
  { value: "DESIGN", label: "UI / UX Design" },
  { value: "SEO_MARKETING", label: "SEO & Digital Marketing (Dev + DM)" },
  { value: "QA_TESTING", label: "QA / Testing & Bug Verification" },
  { value: "OPERATIONS", label: "Operations / Admin / HR" },
  { value: "CLIENT_SERVICING", label: "Client Servicing & Account Management" },
  { value: "GENERAL", label: "General Routine / Other" },
];

export function StartRoutineExecutionModal({
  open,
  template,
  onClose,
  onSuccess,
}: StartRoutineExecutionModalProps) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);

  // Form State
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("DEV");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2" | "P3">("P2");
  const [selectedTaskSuggestionId, setSelectedTaskSuggestionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && template) {
      setProjectId("");
      setDescription(template.description ? `${template.description}\n` : "");
      setPriority(template.priority || "P2");
      setSelectedTaskSuggestionId(null);
      setErrorMsg(null);

      // Fetch projects & assigned tasks
      setLoadingContext(true);
      Promise.all([
        fetch("/api/projects").then((r) => r.json()).catch(() => ({})),
        fetch("/api/tasks?limit=40").then((r) => r.json()).catch(() => ({})),
      ])
        .then(([projData, taskData]) => {
          if (projData?.projects && Array.isArray(projData.projects)) {
            setProjects(projData.projects);
          }
          if (taskData?.tasks && Array.isArray(taskData.tasks)) {
            const active = taskData.tasks.filter(
              (t: AssignedTask) => t.status !== "DONE"
            );
            setAssignedTasks(active);
          }
        })
        .finally(() => {
          setLoadingContext(false);
        });
    }
  }, [open, template]);

  function handleSelectSuggestion(t: AssignedTask) {
    setSelectedTaskSuggestionId(t.id);
    if (t.projectId) {
      setProjectId(t.projectId);
    }
    const cleanDesc = t.description?.replace(/<[^>]*>?/gm, "").trim() || "";
    const taskContext = `[Executing for: ${t.code ? `${t.code} · ` : ""}${t.title}]\n${cleanDesc ? `${cleanDesc}\n` : ""}`;
    setDescription(taskContext);

    if (t.priority && ["P0", "P1", "P2", "P3"].includes(t.priority)) {
      setPriority(t.priority as any);
    }
  }

  async function handleExecute(e: React.FormEvent) {
    e.preventDefault();
    if (!template) return;

    if (!projectId) {
      setErrorMsg("Please select a target project for this routine execution.");
      return;
    }

    if (description.trim().length < 20) {
      setErrorMsg("Please provide at least 20 characters describing what you will be executing.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const title = `[Routine] ${template.title}`;

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim(),
          projectId,
          priority,
          status: "IN_PROGRESS",
          category,
          metadata: {
            isRoutineExecution: true,
            routineTemplateId: template.id,
            routineFrequency: template.frequency,
            linkedTaskId: selectedTaskSuggestionId || undefined,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Routine task started and added to your active work orders ✓", "success");
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error || "Failed to start routine task");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !template) return null;

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
              <Play className="h-4 w-4 fill-current" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-ink">Start Routine: {template.title}</h2>
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <Clock className="h-3 w-3" />
                <span>Scheduled {template.scheduledTime}</span>
                <span>·</span>
                <span>{template.frequency}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleExecute} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 p-2.5 text-[12.5px] text-crimson font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Assigned Tasks Suggestions */}
          {assignedTasks.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-teal/25 bg-teal/5 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-tealhi">
                  <Sparkles className="h-3.5 w-3.5" />
                  Your Active Work Orders (Click to Auto-fill Context)
                </span>
                <span className="text-[11px] text-muted">{assignedTasks.length} assigned</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                {assignedTasks.slice(0, 6).map((task) => {
                  const isSelected = selectedTaskSuggestionId === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => handleSelectSuggestion(task)}
                      className={`flex shrink-0 flex-col items-start gap-1 rounded-md border p-2 text-left transition max-w-[210px] ${
                        isSelected
                          ? "border-teal bg-teal/20 text-ink shadow-sm"
                          : "border-edge bg-surface hover:border-hover hover:bg-hover text-muted hover:text-ink"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-bold text-tealhi">
                          {task.code || "TASK"}
                        </span>
                        <span className="rounded bg-bg px-1 py-0.2 text-[9px] font-mono text-muted">
                          {task.priority}
                        </span>
                      </div>
                      <span className="text-[12px] font-medium text-ink line-clamp-1">
                        {task.title}
                      </span>
                      {task.project?.name && (
                        <span className="text-[10.5px] text-muted truncate">
                          📁 {task.project.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target Project Selection */}
          <div>
            <label className="label mb-1.5 block text-ink">
              Target Project <span className="text-crimson">*</span>
            </label>
            <div className="relative">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                required
              >
                <option value="">-- Select Project / Client --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.client?.name ? `(${p.client.name})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Department / Category & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5 block text-ink">Category / Task Type</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1.5 block text-ink">Execution Priority</label>
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

          {/* Execution Scope Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label block text-ink">
                What will you be doing? (Deliverable Scope) <span className="text-crimson">*</span>
              </label>
              <span
                className={`text-[11px] font-mono ${
                  description.trim().length >= 20 ? "text-tealhi" : "text-crimson"
                }`}
              >
                {description.trim().length}/20 chars min
              </span>
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Specify the deliverable or specific steps being executed for this project today..."
              className="w-full rounded-md border border-edge bg-bg p-2.5 text-[13px] text-ink focus:border-teal focus:outline-none resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hover pt-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-hover px-3.5 py-1.5 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || description.trim().length < 20 || !projectId}
              className="flex items-center gap-1.5 rounded-md bg-teal px-4 py-1.5 text-[13px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-40 shadow-sm"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{submitting ? "Starting..." : "Start Routine Work Order"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
