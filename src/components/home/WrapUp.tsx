"use client";

import { useState } from "react";
import type { WrapData } from "./HomeBento";

export function WrapUp({ dateStr, initial }: { dateStr: string; initial: WrapData }) {
  const [did, setDid] = useState(initial.did);
  const [doing, setDoing] = useState(initial.doing);
  const [blockedOn, setBlockedOn] = useState(initial.blockedOn);
  const [submitted, setSubmitted] = useState(initial.submitted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/today/wrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did, doing, blockedOn, dateStr }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Could not save wrap-up");
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-edge bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-muted focus:outline-none";

  return (
    <section className="rounded-lg border border-edge bg-surface p-4" aria-label="Wrap up">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Wrap up</h2>
        <span className="text-[12px] text-muted">
          {initial.doneCount} done · ~{initial.sessionHrs}h logged
        </span>
      </div>
      {submitted && (
        <p className="mt-2 rounded-md border border-edge bg-raised px-2 py-1 text-[12px] text-teal">
          Submitted for {dateStr} — saving again updates the same entry.
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-edge bg-raised px-2 py-1 text-[12px] text-crimson" role="alert">
          {error}
        </p>
      )}
      <label className="label mb-1 mt-3 block" htmlFor="wrap-did">
        What I did
      </label>
      <textarea
        id="wrap-did"
        rows={2}
        value={did}
        onChange={(e) => setDid(e.target.value)}
        placeholder="Today's completed work…"
        className={field}
      />
      <label className="label mb-1 mt-2 block" htmlFor="wrap-doing">
        What I&apos;m doing next
      </label>
      <textarea
        id="wrap-doing"
        rows={2}
        value={doing}
        onChange={(e) => setDoing(e.target.value)}
        placeholder="Carries into tomorrow…"
        className={field}
      />
      <label className="label mb-1 mt-2 block" htmlFor="wrap-blocked">
        Blockers
      </label>
      <textarea
        id="wrap-blocked"
        rows={1}
        value={blockedOn}
        onChange={(e) => setBlockedOn(e.target.value)}
        placeholder="Anything stuck…"
        className={field}
      />
      <button
        onClick={save}
        disabled={busy}
        className="mt-3 rounded-md bg-teal/20 px-3 py-1.5 text-[13px] font-medium text-teal transition hover:bg-teal/30 disabled:opacity-50"
      >
        {busy ? "Saving…" : submitted ? "Update wrap-up" : "Submit wrap-up"}
      </button>
    </section>
  );
}
