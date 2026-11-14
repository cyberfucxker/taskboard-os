"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send, CheckCircle2, FileEdit, X } from "lucide-react";

export function DailyUpdatePrompt({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const router = useRouter();

  const [did, setDid] = useState("");
  const [doing, setDoing] = useState("");
  const [blocked, setBlocked] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("daily_update_dismissed") === "true") {
      return;
    }

    const checkTime = async () => {
      const now = new Date();
      const h = now.getHours();
      if (h >= 18 && h <= 21 && !hasChecked) {
        setHasChecked(true);
        try {
          const res = await fetch("/api/standup/mine");
          const data = await res.json();
          if (!data.submittedToday) {
            setOpen(true);
          }
        } catch (e) {
          console.error("Standup check failed", e);
        }
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [hasChecked]);

  const handleClose = () => {
    setOpen(false);
    sessionStorage.setItem("daily_update_dismissed", "true");
  };

  const handleAutoFill = async () => {
    setAutoFilling(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/standup/autofill");
      if (!res.ok) throw new Error("Failed to autofill");
      const data = await res.json();
      if (data.autofill?.did) setDid(data.autofill.did);
      if (data.autofill?.doing) setDoing(data.autofill.doing);
      if (data.autofill?.blockedOn) setBlocked(data.autofill.blockedOn);
    } catch (err: any) {
      setErrorMsg("Could not process tasks automatically.");
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!did.trim() && !doing.trim()) {
      setErrorMsg("Please summarize what you accomplished.");
      return;
    }
    setErrorMsg("");

    try {
      const res = await fetch("/api/standup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          did: did.trim(),
          doing: doing.trim(),
          blocked: blocked.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit daily update");
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);

      startTransition(() => {
        router.refresh();
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save update");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 anim-fade" onMouseDown={handleClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-[--edge] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[--edge] px-5 py-4 bg-[var(--bg-canvas)]">
          <div className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-emerald" />
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--fg-default)]">End of Day Update</h2>
              <p className="text-xs text-[var(--fg-muted)]">What did you accomplish today?</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-[--edge] rounded text-[--muted]">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {success ? (
            <div className="py-6 flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in duration-300">
              <div className="w-12 h-12 rounded-full bg-emerald/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald" />
              </div>
              <p className="text-sm font-medium text-emerald">Update published!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-crimson/10 text-crimson text-xs border border-crimson/20">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-emerald">Accomplishments Today</label>
                <textarea
                  value={did}
                  onChange={(e) => setDid(e.target.value)}
                  placeholder="What did you get done?"
                  rows={3}
                  className="w-full text-xs rounded-xl border border-[--edge] bg-[--surface] p-2.5 placeholder:text-[var(--fg-muted)]/50 focus:outline-none focus:border-emerald/50 resize-none transition-all text-[var(--fg-default)]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-teal">Tomorrow focus</label>
                <textarea
                  value={doing}
                  onChange={(e) => setDoing(e.target.value)}
                  placeholder="What are your priorities for tomorrow?"
                  rows={2}
                  className="w-full text-xs rounded-xl border border-[--edge] bg-[--surface] p-2.5 placeholder:text-[var(--fg-muted)]/50 focus:outline-none focus:border-teal/50 resize-none transition-all text-[var(--fg-default)]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-crimson">Blockers? (Optional)</label>
                <textarea
                  value={blocked}
                  onChange={(e) => setBlocked(e.target.value)}
                  placeholder="Are you blocked on anything?"
                  rows={2}
                  className="w-full text-xs rounded-xl border border-[--edge] bg-[--surface] p-2.5 placeholder:text-[var(--fg-muted)]/50 focus:outline-none focus:border-crimson/50 resize-none transition-all text-[var(--fg-default)]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={autoFilling}
                  className="flex-1 py-2 px-3 rounded-xl border border-[--edge] bg-[--surface] hover:bg-hover text-[var(--fg-default)] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {autoFilling ? <RefreshCw size={14} className="animate-spin" /> : <span>Auto-Fill AI</span>}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald hover:bg-emerald text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Publish</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}