"use client";

import React, { useState, useEffect } from "react";
import { ArrowRightLeft, Check, CheckCircle2, ChevronDown, Clock, Loader2, User } from "lucide-react";
import { useRouter } from "next/navigation";

interface EmployeeOption {
  id: string;
  name: string;
  role?: string;
  title?: string;
}

interface RowActionsProps {
  taskId?: string;
  leadId?: string;
  itemId?: string;
  itemTitle?: string;
  itemType?: "task" | "lead" | "approval";
  currentStatus?: string;
  availableStatuses?: { value: string; label: string; helper?: string }[];
  onSuccess?: () => void;
  onUpdateStatus?: () => void;
  className?: string;
}

const DEFAULT_STATUSES = [
  { value: "TODO", label: "To Do", helper: "Not started yet" },
  { value: "IN_PROGRESS", label: "In Progress", helper: "Currently working on this" },
  { value: "IN_REVIEW", label: "In Review", helper: "Waiting for approval or review" },
  { value: "BLOCKED", label: "Blocked", helper: "Stuck or waiting on someone" },
  { value: "DONE", label: "Done", helper: "Completed" },
];

export function RowActions({
  taskId,
  leadId,
  itemId,
  itemTitle,
  itemType,
  currentStatus,
  availableStatuses = DEFAULT_STATUSES,
  onSuccess,
  onUpdateStatus,
  className = "",
}: RowActionsProps) {
  const router = useRouter();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [handoverNote, setHandoverNote] = useState("");

  const effectiveTaskId = taskId || (itemType === "task" ? itemId : undefined);
  const effectiveLeadId = leadId || (itemType === "lead" ? itemId : undefined);

  useEffect(() => {
    if (showHandoverModal && employees.length === 0) {
      fetch("/api/employees")
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && Array.isArray(data.employees)) {
            setEmployees(data.employees);
          }
        })
        .catch(() => {});
    }
  }, [showHandoverModal, employees.length]);

  const handleUpdateStatus = async (status: string) => {
    setShowStatusMenu(false);
    if (onUpdateStatus) {
      onUpdateStatus();
      return;
    }
    setLoading(true);
    try {
      if (effectiveTaskId) {
        const res = await fetch(`/api/tasks/${effectiveTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", status }),
        });
        if (res.ok) {
          onSuccess?.();
          router.refresh();
        }
      } else if (effectiveLeadId) {
        const res = await fetch(`/api/crm/leads/${effectiveLeadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: status }),
        });
        if (res.ok) {
          onSuccess?.();
          router.refresh();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;
    setLoading(true);
    try {
      if (effectiveTaskId) {
        const res = await fetch(`/api/tasks/${effectiveTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add_assignee", employeeId: selectedEmployeeId }),
        });
        if (handoverNote.trim()) {
          await fetch(`/api/tasks/${effectiveTaskId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: `Handed over: ${handoverNote.trim()}` }),
          }).catch(() => {});
        }
        if (res.ok) {
          setShowHandoverModal(false);
          setHandoverNote("");
          onSuccess?.();
          router.refresh();
        }
      } else if (effectiveLeadId) {
        const res = await fetch(`/api/crm/leads/${effectiveLeadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: selectedEmployeeId }),
        });
        if (res.ok) {
          setShowHandoverModal(false);
          setHandoverNote("");
          onSuccess?.();
          router.refresh();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Update Status Dropdown */}
      <div className="relative">
        <button
          type="button"
          disabled={loading}
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="inline-flex items-center gap-1 rounded border border-edge bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors disabled:opacity-50"
          title="Update status"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-muted" /> : <CheckCircle2 className="h-3 w-3 text-muted" />}
          <span>Update</span>
          <ChevronDown className="h-3 w-3 text-muted" />
        </button>

        {showStatusMenu && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-edge bg-surface p-1 shadow-lg z-50">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Change Status</div>
            {availableStatuses.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => handleUpdateStatus(s.value)}
                className="flex w-full flex-col rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-raised transition-colors"
              >
                <div className="flex items-center justify-between font-medium">
                  <span>{s.label}</span>
                  {currentStatus === s.value && <Check className="h-3.5 w-3.5 text-teal" />}
                </div>
                {s.helper && <span className="text-[10px] text-muted">{s.helper}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hand Over Button */}
      <button
        type="button"
        disabled={loading}
        onClick={() => setShowHandoverModal(true)}
        className="inline-flex items-center gap-1 rounded border border-edge bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:text-ink hover:bg-raised transition-colors disabled:opacity-50"
        title="Hand over to another team member"
      >
        <ArrowRightLeft className="h-3 w-3" />
        <span>Hand over</span>
      </button>

      {/* Handover Modal */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-edge bg-surface p-4 shadow-xl">
            <h3 className="text-[14px] font-semibold text-ink">Hand over to someone</h3>
            <p className="mt-0.5 text-[12px] text-muted">Select who should take ownership of this item next.</p>

            <form onSubmit={handleHandover} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-muted mb-1">Assign to</label>
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 text-[12px] text-ink focus:border-teal focus:outline-none"
                >
                  <option value="">Select a person...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.title ? `(${emp.title})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted mb-1">Optional note</label>
                <input
                  type="text"
                  placeholder="e.g. Please check client requirements on slide 3"
                  value={handoverNote}
                  onChange={(e) => setHandoverNote(e.target.value)}
                  className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  className="rounded px-2.5 py-1 text-[12px] text-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedEmployeeId}
                  className="inline-flex items-center gap-1 rounded bg-teal px-3 py-1 text-[12px] font-medium text-white hover:bg-tealhi transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Confirm Handover</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}