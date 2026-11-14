"use client";
import { useState } from "react";

export function PingButton({ taskId }: { taskId: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ping() {
    if (busy || sent) return;
    setBusy(true);
    try {
      await fetch(`/api/tasks/${taskId}/ping`, { method: "POST" });
      setSent(true);
    } catch {
      /* silent */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); ping(); }}
      disabled={busy || sent}
      className={
        sent
          ? "flex-none rounded px-2 py-0.5 text-[11px] font-medium text-emerald"
          : "flex-none rounded border border-teal/40 px-2 py-0.5 text-[11px] font-medium text-teal hover:bg-teal/10 disabled:opacity-50 transition-colors"
      }
    >
      {sent ? "Pinged ✓" : busy ? "…" : "Ping"}
    </button>
  );
}
