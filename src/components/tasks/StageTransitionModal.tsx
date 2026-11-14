"use client";

import { useState } from "react";
import { Check, X, Ban, Play, RotateCcw, Upload, Send } from "lucide-react";
import { Badge, Btn, Avatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { TaskView } from "@/components/tasks/types";
import { DeliverableArtifactsInput } from "@/components/tasks/DeliverableArtifactsInput";

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  BLOCKED: "Blocked",
  DONE: "Done",
};

export function StageTransitionModal({
  task,
  targetStatus,
  open,
  onClose,
  onSuccess,
  currentUserId,
  canAssign,
  currentUserRole,
}: {
  task: TaskView;
  targetStatus: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "IN_REVIEW";
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserId?: string;
  canAssign?: boolean;
  currentUserRole?: string;
}) {
  const toast = useToast();
  const [note, setNote] = useState(targetStatus === "DONE" || targetStatus === "IN_REVIEW" ? task.outcome ?? "" : "");
  const [descriptionDraft, setDescriptionDraft] = useState(task.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open || !task) return null;

  const isLeaderOrCreator = Boolean(
    task.creatorId === currentUserId ||
    canAssign ||
    ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(currentUserRole ?? "")
  );

  const isDoneTarget = targetStatus === "DONE";
  const isSubmitForApproval = isDoneTarget && !isLeaderOrCreator;
  const isReviewTarget = targetStatus === "IN_REVIEW";
  const isBlocked = targetStatus === "BLOCKED";
  const isInProgress = targetStatus === "IN_PROGRESS";
  const isTodo = targetStatus === "TODO";
  const needsDescription = isInProgress && !task.description?.trim() && !descriptionDraft.trim();

  async function submit() {
    setErrorMsg(null);

    // Validation rules per accountability framework
    if (isBlocked && !note.trim()) {
      setErrorMsg("A blocker reason is required to move a task to Blocked.");
      return;
    }
    if ((isDoneTarget || isReviewTarget) && !note.trim()) {
      setErrorMsg(
        isSubmitForApproval
          ? "Please summarize what was accomplished / delivered before submitting for approval."
          : "Please record the outcome / what was achieved before completing."
      );
      return;
    }
    if (isInProgress && !task.description?.trim() && !descriptionDraft.trim()) {
      setErrorMsg("Cannot start a task without a description. Add what this task involves.");
      return;
    }

    setBusy(true);
    try {
      // 1. If description was updated for IN_PROGRESS
      if (isInProgress && descriptionDraft.trim() && descriptionDraft.trim() !== (task.description ?? "")) {
        const descRes = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", description: descriptionDraft.trim() }),
        });
        const descData = await descRes.json();
        if (!descRes.ok || !descData.ok) {
          toast(descData.error ?? "Failed to save task description", "error");
          setBusy(false);
          return;
        }
      }

      // 2. If deliverable file attached on DONE / Approval
      if ((isDoneTarget || isReviewTarget) && file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name);
        formData.append("kind", "GENERAL");
        if (note.trim()) formData.append("note", note.trim());

        const upRes = await fetch(`/api/tasks/${task.id}/reports`, {
          method: "POST",
          body: formData,
        });
        const upData = await upRes.json();
        if (!upRes.ok || !upData.ok) {
          toast(upData.error ?? "Failed to upload deliverable", "error");
          setBusy(false);
          return;
        }
      }

      // 3. Persist status change (send DONE or IN_REVIEW)
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          status: isSubmitForApproval ? "IN_REVIEW" : targetStatus,
          reason: isBlocked || isTodo ? note.trim() || undefined : undefined,
          outcome: isDoneTarget || isReviewTarget ? note.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        toast(
          isSubmitForApproval
            ? "Submitted for approval (In Review) ✓"
            : isDoneTarget
            ? "Marked done ✓"
            : `Moved to ${STATUS_LABELS[targetStatus]}`,
          "success"
        );
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error ?? "Could not update task status");
        toast(data.error ?? "Update failed", "error");
      }
    } catch {
      setErrorMsg("An unexpected error occurred. Please retry.");
      toast("Update failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4 anim-fade" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-hover bg-raised shadow-2xl anim-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-hover bg-bg p-5">
          <div className="min-w-0 flex-1 mr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[12px] font-semibold text-muted">{task.code}</span>
              <Badge text={task.priority} />
              <span className="text-[12px] text-muted">→</span>
              <span
                className="rounded px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background:
                    isSubmitForApproval ? "color-mix(in srgb, var(--amber) 14%, transparent)"
                    : isDoneTarget ? "color-mix(in srgb, var(--emerald) 14%, transparent)"
                    : isBlocked ? "color-mix(in srgb, var(--crimson) 14%, transparent)"
                    : isInProgress ? "color-mix(in srgb, var(--teal) 14%, transparent)"
                    : "color-mix(in srgb, var(--muted) 14%, transparent)",
                  color:
                    isSubmitForApproval ? "var(--amber)"
                    : isDoneTarget ? "var(--emerald)"
                    : isBlocked ? "var(--crimson)"
                    : isInProgress ? "var(--teal)"
                    : "var(--ink2)",
                }}
              >
                {isSubmitForApproval ? "Submit for Approval" : STATUS_LABELS[targetStatus]}
              </span>
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-ink leading-snug line-clamp-1">
              {task.title}
            </h3>

            {/* Badges: Creator & Assignees */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hover bg-raised px-2.5 py-0.5 text-muted">
                <span>Created by</span>
                <span className="font-medium text-ink">{task.creatorName || "Lead"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hover bg-raised px-2.5 py-0.5 text-muted">
                <span>Assignee:</span>
                <span className="font-medium text-tealhi">
                  {task.assignees && task.assignees.length > 0
                    ? task.assignees.map((a) => a.name).join(", ")
                    : task.assignee || "Unassigned"}
                </span>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="rounded-md border border-crimson/40 bg-crimson/10 px-3 py-2 text-[12px] text-crimson">
              {errorMsg}
            </div>
          )}

          {/* DONE / SUBMIT FOR APPROVAL: Outcome & Deliverables */}
          {(isDoneTarget || isReviewTarget) && (
            <>
              {isSubmitForApproval && (
                <div className="rounded-lg border border-amber/30 bg-amber/10 p-3 text-[12px] text-ink">
                  <p className="font-semibold text-amber">⏳ Creator Approval Required</p>
                  <p className="mt-0.5 text-muted">
                    This task will be placed in <strong className="text-ink">In Review</strong> for review by{" "}
                    <strong className="text-ink">{task.creatorName || "the creator/leadership"}</strong>.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">
                  {isSubmitForApproval ? "Summary of Work Delivered" : "Outcome / What was accomplished"}{" "}
                  <span className="text-crimson">*</span>
                </label>
                <textarea
                  autoFocus
                  rows={3}
                  value={note}
                  onChange={(e) => { setNote(e.target.value); setErrorMsg(null); }}
                  placeholder={
                    isSubmitForApproval
                      ? "Summarize the work done, results achieved, and links for reviewer..."
                      : "Summarize the final outcome, verification steps, and delivered result..."
                  }
                  className="w-full resize-none rounded-md border border-hover bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">
                  Deliverable Attachment (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-hover bg-bg px-3 py-2.5 text-[12px] text-muted transition hover:border-teal hover:text-ink">
                    <Upload className="h-3.5 w-3.5" />
                    <span className="truncate">{file ? file.name : "Upload final report / export file"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {file && (
                    <button
                      onClick={() => setFile(null)}
                      className="p-2 text-muted hover:text-crimson"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* BLOCKED: Blocker Reason */}
          {isBlocked && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-crimson">
                Blocker Description <span className="text-crimson">*</span>
              </label>
              <textarea
                autoFocus
                rows={3}
                value={note}
                onChange={(e) => { setNote(e.target.value); setErrorMsg(null); }}
                placeholder="What is blocking this task? What decision, access, or dependency is needed?"
                className="w-full resize-none rounded-md border border-crimson/40 bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-crimson focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">
                Leadership is notified immediately when a task is moved to Blocked.
              </p>
            </div>
          )}

          {/* IN_PROGRESS: Description or Work Notes */}
          {isInProgress && (
            <>
              {!task.description?.trim() && (
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">
                    Task Description <span className="text-crimson">*</span>
                  </label>
                  <textarea
                    autoFocus
                    rows={3}
                    value={descriptionDraft}
                    onChange={(e) => { setDescriptionDraft(e.target.value); setErrorMsg(null); }}
                    placeholder="Describe what needs to be done before starting..."
                    className="w-full resize-none rounded-md border border-hover bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    A clear description is required before moving to In Progress.
                  </p>
                </div>
              )}
              {task.description?.trim() && (
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">
                    Work Notes / Plan (Optional)
                  </label>
                  <textarea
                    autoFocus
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional note for this work session..."
                    className="w-full resize-none rounded-md border border-hover bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                  />
                </div>
              )}
            </>
          )}

          {/* TODO: Return reason */}
          {isTodo && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">
                Reason / Notes (Optional)
              </label>
              <textarea
                autoFocus
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is this task moving back to To Do?"
                className="w-full resize-none rounded-md border border-hover bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-hover bg-bg px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-hover px-3.5 py-1.5 text-[12px] text-muted hover:bg-raised hover:text-ink transition"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || needsDescription}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-semibold text-white transition disabled:opacity-50 ${
              isBlocked
                ? "bg-crimson hover:bg-crimson/90"
                : isSubmitForApproval
                ? "bg-amber hover:bg-amber/90"
                : isDoneTarget
                ? "bg-emerald hover:bg-emerald/90"
                : "bg-teal hover:bg-tealhi"
            }`}
          >
            {isBlocked ? (
              <Ban className="h-3.5 w-3.5" />
            ) : isSubmitForApproval ? (
              <Send className="h-3.5 w-3.5" />
            ) : isDoneTarget ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>
              {busy
                ? "Saving…"
                : isSubmitForApproval
                ? "Submit for Approval"
                : `Confirm & Move to ${STATUS_LABELS[targetStatus]}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
