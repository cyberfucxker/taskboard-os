"use client";

import { useState, useRef, useEffect } from "react";
import { X, Plus, Check, Search, Calendar, AlertCircle, Sparkles } from "lucide-react";
import { useToast } from "@/components/Toast";
import { AssigneeAvatar, PriorityIcon, type Priority } from "./pickers/atoms";

const PRIO: { v: Priority; label: string; color: string }[] = [
  { v: "P0", label: "P0 · Urgent", color: "var(--crimson)" },
  { v: "P1", label: "P1 · High", color: "var(--amber)" },
  { v: "P2", label: "P2 · Normal", color: "var(--teal)" },
  { v: "P3", label: "P3 · Low", color: "var(--muted)" },
];

const DUE_PRESETS: { v: string; label: string }[] = [
  { v: "", label: "No due date" },
  { v: "today", label: "Today" },
  { v: "tomorrow", label: "Tomorrow" },
  { v: "next", label: "Next week" },
];

export interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  employees: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  currentUserId: string;
  currentUserName?: string;
  canAssign: boolean;
  onCreated: () => void;
  clients?: { id: string; name: string }[];
  projects?: { id: string; name: string; category?: string | null; clientId?: string | null }[];
  initialClientId?: string;
  initialProjectId?: string;
  defaultAssigneeIds?: string[];
  defaultDate?: string;
}

export function NewTaskModal({
  open,
  onClose,
  employees,
  departments,
  currentUserId,
  currentUserName,
  canAssign,
  onCreated,
  clients = [],
  projects = [],
  initialClientId,
  initialProjectId,
  defaultAssigneeIds,
  defaultDate,
}: NewTaskModalProps) {
  const toast = useToast();

  // Phase 1 Work Order Model: NO default self-assignment. Delegator explicitly selects assignee.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => defaultAssigneeIds ?? []);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("P2");
  const [duePreset, setDuePreset] = useState<string>(defaultDate ? "custom" : "");
  const [customDueDate, setCustomDueDate] = useState<string>(defaultDate ?? "");
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [department, setDepartment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setErrorMsg(null);
      setAssigneeIds(defaultAssigneeIds ?? []);
      setClientId(initialClientId ?? "");
      setProjectId(initialProjectId ?? "");
      setDepartment("");
    }
  }, [open, defaultAssigneeIds, initialClientId, initialProjectId]);

  // Filter projects by client if client selected
  const availableProjects = clientId
    ? projects.filter((p) => p.clientId === clientId)
    : projects;

  // Auto-set clientId if project has one
  function handleProjectChange(pId: string) {
    setProjectId(pId);
    if (pId) {
      const proj = projects.find((p) => p.id === pId);
      if (proj && proj.clientId) {
        setClientId(proj.clientId);
      }
    }
  }

  function toggleAssignee(empId: string) {
    setAssigneeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  }

  function computeFinalDueDate(): string | null {
    if (duePreset === "custom") return customDueDate || null;
    if (duePreset === "today") {
      return new Date().toISOString().slice(0, 10);
    }
    if (duePreset === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    if (duePreset === "next") {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }

  if (!open) return null;

  const isDescValid = description.trim().length >= 20;
  const isFormValid = title.trim().length > 0 && isDescValid && assigneeIds.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Please enter a task title.");
      return;
    }
    if (!isDescValid) {
      setErrorMsg("Work order description is required (minimum 20 characters).");
      return;
    }
    if (assigneeIds.length === 0) {
      setErrorMsg("Please select at least one assignee for this work order.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload: any = {
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: computeFinalDueDate(),
      clientId: clientId || null,
      projectId: projectId || null,
      assigneeIds,
      ...(department ? { department } : {}),
      assigneeId: assigneeIds[0], // primary assignee
    };

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Work order created ✓", "success");
        onCreated();
        onClose();
      } else {
        setErrorMsg(data.error || "Failed to create task.");
        toast(data.error || "Failed to create task", "error");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredEmployees = employees.filter((e) =>
    e.name.toLowerCase().includes(empSearch.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm anim-fade"
      onMouseDown={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-edge bg-raised p-6 shadow-2xl anim-up text-ink"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hover pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/15 text-tealhi">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-ink">Create Work Order</h2>
              <p className="text-[12px] text-muted">
                Assign tasks with required scope and deliverables.
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 p-2.5 text-[12.5px] text-crimson font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="label mb-1.5 block text-ink">
              Task Title <span className="text-crimson">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Responsive Navigation Drawer"
              className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13.5px] text-ink focus:border-teal focus:outline-none placeholder:text-faint"
              required
              autoFocus
            />
          </div>

          {/* Description — Minimum 20 Characters Required */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label text-ink">
                Task Description / Work Order Scope <span className="text-crimson">*</span>
              </label>
              <span
                className={`font-mono text-[11px] ${
                  isDescValid ? "text-teal font-bold" : "text-crimson font-medium"
                }`}
              >
                {description.trim().length}/20 chars min
              </span>
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Detail the execution scope, requirements, target components, and definition of done (min 20 characters)..."
              className={`w-full rounded-md border bg-bg p-3 text-[13px] text-ink placeholder:text-faint focus:outline-none transition resize-none ${
                description.length > 0 && !isDescValid
                  ? "border-crimson/50 focus:border-crimson"
                  : "border-edge focus:border-teal"
              }`}
              required
            />
            <p className="mt-1 text-[11.5px] text-muted">
              {isDescValid
                ? "✓ Description requirement met"
                : "Clear work orders require at least 20 characters describing the deliverable."}
            </p>
          </div>

          {/* Assignees (Explicit selection required) */}
          <div>
            <label className="label mb-1.5 block text-ink">
              Assignee(s) <span className="text-crimson">*</span>
            </label>
            <div className="relative">
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-edge bg-bg p-2 min-h-[42px]">
                {assigneeIds.length === 0 ? (
                  <span className="text-[12.5px] text-muted italic">
                    No assignee selected — click below to assign
                  </span>
                ) : (
                  assigneeIds.map((id) => {
                    const emp = employees.find((e) => e.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface px-2.5 py-0.5 text-[12px] font-medium text-ink"
                      >
                        <AssigneeAvatar name={emp?.name ?? "?"} size={16} />
                        <span>{emp?.name ?? "Unknown"}</span>
                        <button
                          type="button"
                          onClick={() => toggleAssignee(id)}
                          className="text-muted hover:text-crimson"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })
                )}
                <button
                  type="button"
                  onClick={() => setAssigneeDropdownOpen((v) => !v)}
                  className="ml-auto flex items-center gap-1 rounded bg-hover px-2 py-1 text-[11.5px] font-medium text-teal hover:text-tealhi transition"
                >
                  <Plus className="h-3 w-3" />
                  <span>Select Team</span>
                </button>
              </div>

              {/* Dropdown for selecting assignees */}
              {assigneeDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-lg border border-edge bg-raised p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
                    <input
                      type="text"
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      placeholder="Search employees..."
                      className="w-full rounded border border-edge bg-bg py-1 pl-8 pr-2 text-[12px] text-ink focus:border-teal focus:outline-none"
                    />
                  </div>
                  <div className="space-y-0.5">
                    {filteredEmployees.map((emp) => {
                      const isAssigned = assigneeIds.includes(emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => toggleAssignee(emp.id)}
                          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12.5px] transition ${
                            isAssigned
                              ? "bg-surface text-ink font-semibold"
                              : "hover:bg-hover text-ink"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <AssigneeAvatar name={emp.name} size={18} />
                            <span>{emp.name}</span>
                          </span>
                          {isAssigned && <Check className="h-3.5 w-3.5 text-teal" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Client & Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5 block text-ink">Client</label>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setProjectId("");
                }}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
              >
                <option value="">No Client (Internal)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1.5 block text-ink">Project</label>
              <select
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
              >
                <option value="">No Project</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Department - which team should do this work (Auto follows the assignee) */}
          <div className="mt-3">
            <label className="label mb-1.5 block text-ink">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
            >
              <option value="">Auto (by assignee department)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5 block text-ink">Priority</label>
              <div className="flex gap-1.5">
                {PRIO.map((p) => (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => setPriority(p.v)}
                    className={`flex-1 rounded border py-1.5 text-[12px] font-mono font-medium transition ${
                      priority === p.v
                        ? "border-teal bg-teal/15 text-teal font-bold"
                        : "border-edge bg-bg text-muted hover:text-ink"
                    }`}
                  >
                    {p.v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label mb-1.5 block text-ink">Due Date</label>
              <div className="flex gap-1.5">
                {DUE_PRESETS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => {
                      setDuePreset(d.v);
                      if (d.v !== "custom") setCustomDueDate("");
                    }}
                    className={`flex-1 rounded border py-1.5 text-[11.5px] transition ${
                      duePreset === d.v
                        ? "border-teal bg-teal/15 text-teal font-semibold"
                        : "border-edge bg-bg text-muted hover:text-ink"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Submit buttons */}
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
              disabled={submitting || !isFormValid}
              className="rounded-md bg-teal px-4 py-1.5 text-[13px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-40 shadow-sm"
            >
              {submitting ? "Creating..." : "Create Work Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
