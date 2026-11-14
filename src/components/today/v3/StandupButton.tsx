"use client";
import { useState } from "react";
import { ClipboardList, X, Send } from "lucide-react";

export function StandupButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [did, setDid] = useState("");
  const [doing, setDoing] = useState("");
  const [blockers, setBlockers] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!did.trim() && !doing.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/standup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did: did.trim(), doing: doing.trim(), blockedOn: blockers.trim() }),
      });
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setDid(""); setDoing(""); setBlockers(""); }, 1500);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-[var(--green)]">✓ Standup posted</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-hover hover:text-ink"
      >
        <ClipboardList size={13} /> Post standup
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-md rounded-[12px] border border-edge bg-surface p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">Daily standup</h2>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {([
                { label: "What did I do yesterday?", value: did, set: setDid },
                { label: "What will I do today?", value: doing, set: setDoing },
                { label: "Any blockers? (optional)", value: blockers, set: setBlockers },
              ] as const).map(({ label, value, set }) => (
                <div key={label}>
                  <label className="mb-1 block text-[12px] font-medium text-muted">{label}</label>
                  <textarea
                    value={value}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-[8px] border border-edge bg-raised px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-[var(--teal)] focus:outline-none"
                    placeholder="..."
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-[12px] text-muted hover:text-ink">Cancel</button>
              <button
                onClick={submit}
                disabled={busy || (!did.trim() && !doing.trim())}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--teal)] px-3 py-1.5 text-[12px] font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-40"
              >
                <Send size={12} /> {busy ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
