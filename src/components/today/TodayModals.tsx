"use client";

import { useState } from "react";
import { RefreshCw, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toast";

export interface ModalTask {
  id: string;
  title: string;
  client?: { name?: string | null } | null;
  clientName?: string | null;
}

const overlay = "fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4";
const panel =
  "flex max-h-[85vh] w-full max-w-md flex-col rounded-t-[10px] border border-edge bg-raised text-ink shadow-popover anim-up sm:rounded-[10px]";
const fieldCls =
  "h-8 w-full rounded-md border border-edge bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none";
const labelCls = "mb-1 block text-[12px] font-medium text-muted";
const ghostBtn = "h-8 rounded-md px-3 text-[13px] font-medium text-ink2 hover:bg-hover hover:text-ink";
const primaryBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-teal px-3 text-[13px] font-medium text-white transition hover:bg-tealhi disabled:opacity-50";

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
      <h4 className="text-[15px] font-medium">{title}</h4>
      <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Raise a blocker (POST /api/blockers, unchanged). */
export function RaiseBlockerModal({
  open,
  onClose,
  tasks,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  tasks: ModalTask[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<"MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [taskId, setTaskId] = useState("");
  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    try {
      const res = await fetch("/api/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: taskId || null, reason: reason.trim(), severity }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Blocker logged and team alerted", "success");
        setReason("");
        setTaskId("");
        onCreated();
        onClose();
      } else {
        toast(data.error || "Failed to log blocker", "error");
      }
    } catch {
      toast("Error submitting blocker", "error");
    }
  }

  return (
    <div className={overlay} onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} className={panel}>
        <ModalHead title="Raise a blocker" onClose={onClose} />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div>
            <label className={labelCls}>Related task</label>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={fieldCls}>
              <option value="">General blocker</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Severity</label>
            <div className="grid grid-cols-3 gap-2">
              {(["MEDIUM", "HIGH", "CRITICAL"] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverity(sev)}
                  className={cn(
                    "h-8 rounded-md border text-[12px] font-medium transition-colors",
                    severity === sev ? "border-crimson/40 bg-crimson/10 text-crimson" : "border-edge text-muted hover:bg-hover"
                  )}
                >
                  {sev.charAt(0) + sev.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>What is blocked?</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Waiting on client asset approval"
              className="w-full resize-none rounded-md border border-edge bg-surface p-2.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Log blocker</button>
        </div>
      </form>
    </div>
  );
}

/** Verify a deliverable URL and submit (POST /api/artifacts/verify, unchanged). */
export function SubmitDeliverableModal({
  open,
  onClose,
  tasks,
}: {
  open: boolean;
  onClose: () => void;
  tasks: ModalTask[];
}) {
  const toast = useToast();
  const [taskId, setTaskId] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("DRIVE");
  const [verifying, setVerifying] = useState(false);
  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !taskId) return;
    setVerifying(true);
    try {
      const verifyRes = await fetch("/api/artifacts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), taskId }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.ok && verifyData.data?.status === "FAILED") {
        toast("Artifact URL verification failed: " + (verifyData.data?.error || "Inaccessible"), "error");
        setVerifying(false);
        return;
      }
      toast("Artifact verified! Task submitted to review gate.", "success");
      onClose();
      setUrl("");
      setTaskId("");
    } catch {
      toast("Artifact submission error", "error");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className={overlay} onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} className={panel}>
        <ModalHead title="Submit deliverable" onClose={onClose} />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div>
            <label className={labelCls}>Task</label>
            <select required value={taskId} onChange={(e) => setTaskId(e.target.value)} className={fieldCls}>
              <option value="">Choose a task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title} ({t.client?.name || t.clientName || "Acme"})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "DRIVE", label: "Google Drive" },
                { id: "URL", label: "Staging URL" },
                { id: "GITHUB", label: "Commit / PR" },
              ].map((typ) => (
                <button
                  key={typ.id}
                  type="button"
                  onClick={() => setType(typ.id)}
                  className={cn(
                    "h-8 rounded-md border text-[12px] font-medium transition-colors",
                    type === typ.id ? "border-teal/40 bg-teal/10 text-tealhi" : "border-edge text-muted hover:bg-hover"
                  )}
                >
                  {typ.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Deliverable URL</label>
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              className={fieldCls}
            />
            <span className="mt-1 block text-[12px] text-muted">The link is checked for access before it is submitted.</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={verifying} className={primaryBtn}>
            {verifying ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" /> Verify and submit
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
