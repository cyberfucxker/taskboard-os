"use client";

import { useState } from "react";
import { Flag, X, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";

interface FlagTaskModalProps {
  open: boolean;
  taskId: string;
  taskCode: string;
  taskTitle: string;
  currentReason?: string | null;
  onClose: () => void;
  onFlagged: () => void;
}

export function FlagTaskModal({
  open,
  taskId,
  taskCode,
  taskTitle,
  currentReason,
  onClose,
  onFlagged,
}: FlagTaskModalProps) {
  const toast = useToast();
  const [reason, setReason] = useState(currentReason ?? "");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const isValid = reason.trim().length >= 15;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      setErrorMsg("Please provide a detailed blocker reason (minimum 15 characters).");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          status: "BLOCKED",
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Task flagged as blocked ⚑", "success");
        onFlagged();
        onClose();
      } else {
        setErrorMsg(data.error || "Failed to flag task.");
        toast(data.error || "Failed to flag task", "error");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "An unexpected error occurred.");
      toast("An error occurred", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm anim-fade"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-edge bg-raised p-5 shadow-2xl anim-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hover pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-crimson/15 text-crimson">
              <Flag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Flag Task Blocker</h3>
              <p className="text-[11.5px] text-muted font-mono">{taskCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-3">
          <p className="text-[13px] text-muted">
            Flagging: <span className="font-semibold text-ink font-sans">&ldquo;{taskTitle}&rdquo;</span>
          </p>

          <div className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-[12px] text-ink">
            <p className="font-semibold text-crimson flex items-center gap-1.5">
              <span>⚑ Blocker Accountability</span>
            </p>
            <p className="mt-1 text-muted leading-relaxed">
              Flagging halts the timer and alerts your team lead. State exactly what is stopping you and who needs to unblock you.
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 p-2.5 text-[12.5px] text-crimson font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="label mb-1.5 block text-ink">
              What&apos;s stopping you? <span className="text-crimson">*</span>
            </label>
            <textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="e.g. Waiting on client API credentials from sales team, or missing Figma assets (min 15 characters)..."
              className={`w-full rounded-md border bg-bg p-3 text-[13px] text-ink placeholder:text-faint focus:outline-none transition resize-none ${
                reason.length > 0 && !isValid
                  ? "border-crimson/50 focus:border-crimson"
                  : "border-edge focus:border-crimson"
              }`}
            />
            <div className="mt-1 flex items-center justify-between text-[11.5px]">
              <span className={isValid ? "text-teal font-medium" : "text-muted"}>
                {isValid
                  ? "✓ Blocker reason valid"
                  : "Explain the blocker clearly (minimum 15 characters)"}
              </span>
              <span
                className={`font-mono ${
                  isValid ? "text-teal font-bold" : "text-crimson font-medium"
                }`}
              >
                {reason.trim().length}/15 chars
              </span>
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
              disabled={loading || !isValid}
              className="rounded-md bg-crimson px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-crimson/90 disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
            >
              <Flag className="h-3.5 w-3.5" />
              <span>{loading ? "Flagging..." : "Flag Blocker (⚑)"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
