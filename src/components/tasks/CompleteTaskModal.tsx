"use client";

import { useState } from "react";
import { Check, X, Upload, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { Btn, inputCls } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface CompleteTaskModalProps {
  open: boolean;
  taskId: string;
  taskCode?: string;
  taskTitle?: string;
  onClose: () => void;
  onCompleted?: () => void;
  onConfirm?: (outcome: string) => Promise<void>;
  isLeaderOrCreator?: boolean;
}

export function CompleteTaskModal({
  taskId,
  taskCode,
  taskTitle,
  open,
  onClose,
  onCompleted,
  onConfirm,
  isLeaderOrCreator = true,
}: CompleteTaskModalProps) {
  const toast = useToast();
  const [outcome, setOutcome] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const isOutcomeValid = outcome.trim().length >= 20;

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!isOutcomeValid) {
      setErrorMsg("Please provide a detailed completion note (minimum 20 characters).");
      return;
    }

    setBusy(true);
    setErrorMsg(null);

    try {
      if (onConfirm) {
        await onConfirm(outcome.trim());
        if (onCompleted) onCompleted();
        onClose();
        return;
      }

      // 1. Upload report if a file is attached
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name);
        formData.append("kind", "GENERAL");
        if (outcome.trim()) formData.append("note", outcome.trim());

        const upRes = await fetch(`/api/tasks/${taskId}/reports`, {
          method: "POST",
          body: formData,
        });
        const upData = await upRes.json();
        if (!upRes.ok || !upData.ok) {
          toast(upData.error ?? "Failed to upload file", "error");
          setBusy(false);
          return;
        }
      }

      // 2. Mark task DONE (leaders/creators) or IN_REVIEW (non-leaders)
      const targetStatus = isLeaderOrCreator ? "DONE" : "IN_REVIEW";
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          status: targetStatus,
          outcome: outcome.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        toast(
          isLeaderOrCreator ? "Task marked done ✓" : "Submitted for approval (In Review) ✓",
          "success"
        );
        if (onCompleted) onCompleted();
        onClose();
      } else {
        setErrorMsg(data.error ?? "Could not update task");
        toast(data.error ?? "Could not update task", "error");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "An unexpected error occurred. Please retry.");
      toast("An error occurred", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm anim-fade"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-edge bg-raised p-5 shadow-2xl anim-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hover pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/15 text-tealhi">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">
                {isLeaderOrCreator
                  ? `Complete ${taskCode || "Task"}`
                  : `Submit ${taskCode || "Task"} for Approval`}
              </h2>
              {taskTitle && (
                <p className="text-[11.5px] text-muted truncate max-w-[280px]">
                  {taskTitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 p-2.5 text-[12.5px] text-crimson font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isLeaderOrCreator && (
            <div className="rounded-lg border border-amber/30 bg-amber/10 p-3 text-[12px] text-ink">
              <p className="font-semibold text-amber">⏳ Creator Approval Required</p>
              <p className="mt-0.5 text-muted">
                This task will transition to <strong className="text-ink">In Review</strong> until approved by the task creator or lead.
              </p>
            </div>
          )}

          <div>
            <label className="label mb-1.5 block text-ink">
              {isLeaderOrCreator
                ? "Completion Note / Deliverables Summary"
                : "Summary of Work Delivered"}{" "}
              <span className="text-crimson">*</span>
            </label>
            <textarea
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={
                isLeaderOrCreator
                  ? "Detail what was accomplished, links to PRs, deliverables, or testing notes (min 20 characters)..."
                  : "Summarize what was completed, key deliverables, or notes for approval (min 20 characters)..."
              }
              className={`w-full rounded-md border bg-bg p-3 text-[13px] text-ink placeholder:text-faint focus:outline-none transition resize-none ${
                outcome.length > 0 && !isOutcomeValid
                  ? "border-crimson/50 focus:border-crimson"
                  : "border-edge focus:border-teal"
              }`}
              rows={3}
              autoFocus
            />
            <div className="mt-1 flex items-center justify-between text-[11.5px]">
              <span className={isOutcomeValid ? "text-teal font-medium" : "text-muted"}>
                {isOutcomeValid
                  ? "✓ Verification note valid"
                  : "State deliverables clearly (minimum 20 characters)"}
              </span>
              <span
                className={`font-mono ${
                  isOutcomeValid ? "text-teal font-bold" : "text-crimson font-medium"
                }`}
              >
                {outcome.trim().length}/20 chars
              </span>
            </div>
          </div>

          <div>
            <label className="label mb-1.5 block text-ink">Deliverable Attachment (optional)</label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-edge bg-bg px-4 py-2.5 text-[12.5px] text-muted transition hover:border-teal hover:text-ink">
                <Upload className="h-4 w-4 text-teal" />
                <span className="truncate max-w-[220px]">
                  {file ? file.name : "Upload final file or report"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="p-1.5 text-muted hover:text-crimson transition"
                  title="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hover pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-hover px-3.5 py-1.5 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !isOutcomeValid}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-semibold text-bg transition disabled:opacity-40 shadow-sm ${
                isLeaderOrCreator
                  ? "bg-teal hover:bg-tealhi"
                  : "bg-amber text-bg hover:bg-amber/90"
              }`}
            >
              {isLeaderOrCreator ? (
                <Check className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>
                {busy
                  ? "Saving…"
                  : isLeaderOrCreator
                  ? "Confirm Completion"
                  : "Submit for Approval"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
