"use client";

import { useState } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Download } from "lucide-react";

/**
 * Lead importer.
 *
 * The flow is deliberately dry-run-first: pick a file, check the columns we
 * recognised, preview exactly what would happen, and only then write. The
 * commit button is disabled until a preview has been run against the exact
 * mapping currently selected, so nobody can change a mapping after previewing
 * and commit against something they never saw.
 */

type Outcome = "new" | "updated" | "duplicate" | "skipped";

interface RowResult {
  row: number;
  outcome: Outcome;
  name: string;
  email: string | null;
  phone: string | null;
  reason?: string;
}

interface Report {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  duplicates: number;
  skipped: number;
  unmappedHeaders: string[];
  rows: RowResult[];
  warnings: string[];
}

const FIELDS = [
  "name", "firstName", "lastName", "company", "email", "phone",
  "city", "notes", "nextStep", "score", "stage", "source", "createdAt", "owner",
];

const TONE: Record<Outcome, string> = {
  new: "text-emerald",
  updated: "text-tealhi",
  duplicate: "text-amber",
  skipped: "text-muted",
};

export function LeadImportPanel({ employees }: { employees: { id: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"inspect" | "preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<"skip" | "update">("skip");
  const [ownerId, setOwnerId] = useState<string>("");

  const base64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("Could not read that file."));
      r.readAsDataURL(f);
    });

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/leads/import/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  }

  async function onPick(f: File | null) {
    setError(null);
    setReport(null);
    setFile(f);
    if (!f) {
      setHeaders([]);
      setMapping({});
      return;
    }
    setBusy("inspect");
    try {
      const data = await call({ file: await base64(f), fileName: f.name, inspectOnly: true });
      setHeaders(data.inspect.headers);
      setMapping(data.inspect.suggestedMapping ?? {});
    } catch (e) {
      setError((e as Error).message);
      setFile(null);
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setHeaders([]);
    setMapping({});
    setReport(null);
    setError(null);
  }

  async function preview() {
    if (!file) return;
    setBusy("preview");
    setError(null);
    try {
      const data = await call({
        file: await base64(file),
        fileName: file.name,
        mapping,
        conflictPolicy,
        defaultOwnerId: ownerId || null,
        dryRun: true,
      });
      setReport(data.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!file || !report) return;
    const ok = window.confirm(
      `Import ${report.created} new lead(s)${report.updated ? ` and update ${report.updated}` : ""}?\n\n` +
        `This cannot be undone from here. Duplicates already in TaskBoard will be ` +
        `${conflictPolicy === "skip" ? "skipped" : "filled in"}.`
    );
    if (!ok) return;
    setBusy("commit");
    setError(null);
    try {
      const data = await call({
        file: await base64(file),
        fileName: file.name,
        mapping,
        conflictPolicy,
        defaultOwnerId: ownerId || null,
        dryRun: false,
      });
      setReport(data.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5 p-4">
      {/* Step 1: file */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-muted">1. Choose a file</h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-hover px-3 py-2 text-[12px] text-ink hover:bg-raised">
            <Upload className="h-4 w-4" />
            {file ? "Replace file" : "Select CSV"}
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <span className="inline-flex items-center gap-2 text-[12px] text-muted">
              <FileText className="h-3.5 w-3.5" />
              {file.name}
            </span>
          )}
          {file && (
            <button onClick={reset} className="text-[11px] text-muted hover:text-ink underline">
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Step 2: mapping */}
      {headers.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-medium text-muted">
            2. Check the columns
          </h3>
          <p className="text-[11px] text-muted">
            We matched these automatically. Change anything that is wrong.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {headers.map((h) => (
              <label key={h} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-ink" title={h}>
                  {h}
                </span>
                <select
                  value={mapping[h] ?? ""}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[h] = e.target.value;
                    else delete next[h];
                    setMapping(next);
                    setReport(null);
                  }}
                  className="rounded border border-hover bg-bg px-1.5 py-1 text-[11px] text-ink"
                >
                  <option value="">Ignore</option>
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: options + preview */}
      {headers.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[12px] font-medium text-muted">3. Preview, then import</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              If already in TaskBoard
              <select
                value={conflictPolicy}
                onChange={(e) => { setConflictPolicy(e.target.value as "skip" | "update"); setReport(null); }}
                className="rounded border border-hover bg-bg px-1.5 py-1 text-[11px] text-ink"
              >
                <option value="skip">Skip them</option>
                <option value="update">Fill in missing details</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              Assign to
              <select
                value={ownerId}
                onChange={(e) => { setOwnerId(e.target.value); setReport(null); }}
                className="rounded border border-hover bg-bg px-1.5 py-1 text-[11px] text-ink"
              >
                <option value="">Nobody</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={preview}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md border border-hover px-3 py-2 text-[12px] text-ink hover:bg-raised disabled:opacity-50"
            >
              {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Preview (nothing is saved)
            </button>
            <button
              onClick={commit}
              disabled={busy !== null || !report || report.dryRun === false}
              className="inline-flex items-center gap-2 rounded-md bg-teal px-3 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy === "commit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {report && !report.dryRun ? "Imported" : "Import for real"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--crimson)_30%,transparent)] bg-[color-mix(in_srgb,var(--crimson)_10%,transparent)] p-3 text-[12px] text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {report && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <span className="font-medium text-ink">
              {report.dryRun ? "Preview" : "Imported"}
            </span>
            <span className="text-emerald">{report.created} new</span>
            {report.updated > 0 && <span className="text-tealhi">{report.updated} updated</span>}
            <span className="text-amber">{report.duplicates} duplicates</span>
            <span className="text-muted">{report.skipped} skipped</span>
            <span className="text-muted">of {report.total} rows</span>
            <button
              onClick={() => {
                const lines = [
                  "row,outcome,name,email,phone,reason",
                  ...report.rows.map((r) =>
                    [r.row, r.outcome, r.name, r.email ?? "", r.phone ?? "", r.reason ?? ""]
                      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                      .join(",")
                  ),
                ];
                const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `taskboard-import-${report.dryRun ? "preview" : "result"}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" /> Download report
            </button>
          </div>

          {report.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] p-2.5 text-[12px] text-amber">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{w}</span>
            </div>
          ))}

          <div className="max-h-72 overflow-auto rounded-md border border-hover">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-raised text-muted">
                <tr>
                  <th className="px-2 py-1.5">Row</th>
                  <th className="px-2 py-1.5">Outcome</th>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Contact</th>
                  <th className="px-2 py-1.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.slice(0, 300).map((r) => (
                  <tr key={r.row} className="border-t border-hover">
                    <td className="px-2 py-1.5 text-muted">{r.row}</td>
                    <td className={`px-2 py-1.5 ${TONE[r.outcome]}`}>{r.outcome}</td>
                    <td className="px-2 py-1.5 text-ink">{r.name}</td>
                    <td className="px-2 py-1.5 text-muted">{r.email || r.phone || "-"}</td>
                    <td className="px-2 py-1.5 text-muted">{r.reason || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.rows.length > 300 && (
            <p className="text-[11px] text-muted">
              Showing the first 300 rows. Download the report for the full list.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
