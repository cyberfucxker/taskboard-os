"use client";

import { useEffect, useState } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";

/**
 * TeleCRM sync control.
 *
 * Everything here is gated on credentials the org has not entered yet, so the
 * panel's main job when unconfigured is to say exactly what is missing rather
 * than showing a dead button.
 */

interface State {
  configured: boolean;
  enterpriseId: string | null;
  state: {
    cursor: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    lastCount: number;
  } | null;
  batches: {
    id: string;
    source: string;
    totalRows: number;
    importedRows: number;
    duplicateRows: number;
    skippedRows: number;
    dryRun: boolean;
    startedAt: string;
  }[];
}

export function TeleCrmSyncPanel() {
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState<"preview" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maxPages, setMaxPages] = useState(5);
  const [result, setResult] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/leads/sync/telecrm");
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      /* leave the panel in its loading state rather than showing a false error */
    }
  };

  useEffect(() => {
    load();
  }, []);
  useOnLiveChange(() => { load(); });

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "run");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/leads/sync/telecrm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, maxPages }),
      });
      const body = await res.json();
      if (!body?.ok) throw new Error(body?.result?.error || body?.error || `Failed (${res.status})`);
      const r = body.result;
      setResult(
        dryRun
          ? `Previewed ${r.pagesFetched} page(s), ${r.pulled} lead(s) read. Nothing saved.`
          : `Synced ${r.pulled} lead(s) across ${r.pagesFetched} page(s). Stopped: ${r.stoppedBecause}.`
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (data && !data.configured) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] p-3 text-[12px] text-amber">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">TeleCRM is not connected yet.</p>
            <p>
              Add the Enterprise ID and a <strong>Sync</strong> API token under
              Settings &rarr; Integrations &rarr; Provider credentials. An Async token
              cannot read leads back, so it will not work here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Pages per run
          <input
            type="number"
            min={1}
            max={200}
            value={maxPages}
            onChange={(e) => setMaxPages(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            className="w-16 rounded border border-hover bg-bg px-1.5 py-1 text-[11px] text-ink"
          />
        </label>
        <button
          onClick={() => run(true)}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-md border border-hover px-3 py-2 text-[12px] text-ink hover:bg-raised disabled:opacity-50"
        >
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Preview
        </button>
        <button
          onClick={() => run(false)}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-md bg-teal px-3 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Sync now
        </button>
      </div>

      {result && (
        <p className="flex items-start gap-2 text-[12px] text-emerald">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {result}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-2 text-[12px] text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {data?.state && (
        <div className="space-y-1 text-[12px] text-muted">
          <p>
            Last run: {data.state.lastRunAt ? new Date(data.state.lastRunAt).toLocaleString() : "never"}
            {data.state.lastStatus ? ` (${data.state.lastStatus})` : ""}
          </p>
          {data.state.lastError && <p className="text-crimson">{data.state.lastError}</p>}
        </div>
      )}

      {data && data.batches.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-medium text-muted">Recent imports</h4>
          <table className="w-full text-left text-[11px]">
            <thead className="text-muted">
              <tr>
                <th className="py-1">When</th>
                <th>Source</th>
                <th>New</th>
                <th>Duplicates</th>
                <th>Skipped</th>
              </tr>
            </thead>
            <tbody>
              {data.batches.map((b) => (
                <tr key={b.id} className="border-t border-hover text-ink">
                  <td className="py-1.5">{new Date(b.startedAt).toLocaleString()}</td>
                  <td>{b.source}</td>
                  <td>{b.importedRows}</td>
                  <td>{b.duplicateRows}</td>
                  <td>{b.skippedRows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted">
        A scheduled sync also runs nightly at 02:40. It resumes from the last position, so
        re-running is safe.
      </p>
    </div>
  );
}
