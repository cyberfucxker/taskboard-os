"use client";

import React, { useMemo, useState } from "react";
import {
  Clock,
  Users,
  Calendar,
  Download,
  BarChart3,
  Briefcase,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { fmtMs } from "@/components/today/HoursRing";

export interface TeamTimesheetRow {
  id: string;
  name: string;
  role: string;
  departmentName: string | null;
  days: Array<{ date: string; sessionMs: number; otMs: number; manualMs: number; totalMs: number }>;
  weekTotalMs: number;
  weekOtMs: number;
}

const fmtHrs = (ms: number) => (ms / 3600000).toFixed(1);
const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Leadership team timesheet — previous days of tracked time per employee. */
export function TeamTimesheet({
  rows,
  days,
}: {
  rows: TeamTimesheetRow[];
  days: string[];
}) {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.departmentName).filter(Boolean))] as string[],
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (dept !== "ALL" && r.departmentName !== dept) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.role.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function exportCsv() {
    const header = ["Employee", "Role", "Department", ...days.map(fmtDay), "Week Total (h)", "OT (h)"];
    const lines = filtered.map((r) => [
      r.name,
      r.role,
      r.departmentName ?? "",
      ...r.days.map((d) => fmtHrs(d.totalMs)),
      fmtHrs(r.weekTotalMs),
      fmtHrs(r.weekOtMs),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `taskboard-timesheet-${days[0]}-to-${days[days.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const weekTotal = filtered.reduce((a, r) => a + r.weekTotalMs, 0);
  const weekOt = filtered.reduce((a, r) => a + r.weekOtMs, 0);

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[var(--fg-muted)]">
              Employees Tracked
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg-default)]">{filtered.length}</div>
          </div>
          <Users className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[var(--fg-muted)]">
              Period Total
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg-default)]">
              {fmtHrs(weekTotal)}h
            </div>
          </div>
          <BarChart3 className="h-5 w-5 text-[var(--teal)]" />
        </div>
        <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[var(--fg-muted)]">
              Overtime (Period)
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg-default)]">
              {fmtHrs(weekOt)}h
            </div>
          </div>
          <Clock className="h-5 w-5 text-[var(--amber)]" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setDept("ALL")}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              dept === "ALL"
                ? "bg-[var(--fg-default)] text-[var(--bg-canvas)]"
                : "border border-[var(--border-subtle)] text-[var(--fg-muted)] hover:text-[var(--fg-default)]"
            }`}
          >
            All
          </button>
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                dept === d
                  ? "bg-[var(--fg-default)] text-[var(--bg-canvas)]"
                  : "border border-[var(--border-subtle)] text-[var(--fg-muted)] hover:text-[var(--fg-default)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search employee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-3 py-1.5 text-xs text-[var(--fg-default)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--accent-hi)]"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Table (horizontal scroll on mobile) */}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)]">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[11px] text-[var(--fg-muted)]">
              <th className="px-3 py-2.5">Employee</th>
              <th className="px-2 py-2.5">Role</th>
              <th className="px-2 py-2.5">Dept</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-2.5 text-right whitespace-nowrap font-medium">
                  {fmtDay(d)}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5 text-right">OT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <React.Fragment key={r.id}>
                <tr
                  key={r.id}
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="cursor-pointer border-b border-[var(--line)] transition hover:bg-[var(--hover)]"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-medium text-[var(--fg-default)]">
                      {expanded === r.id ? (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
                      )}
                      {r.name}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-[var(--fg-muted)]">{r.role}</td>
                  <td className="px-2 py-2.5 text-[var(--fg-muted)]">{r.departmentName ?? "—"}</td>
                  {r.days.map((d) => (
                    <td
                      key={d.date}
                      className={`px-2 py-2.5 text-right tnum ${
                        d.totalMs > 0 ? "text-[var(--fg-default)]" : "text-[var(--faint)]"
                      }`}
                    >
                      {d.totalMs > 0 ? fmtHrs(d.totalMs) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right tnum font-semibold text-[var(--teal)]">
                    {fmtHrs(r.weekTotalMs)}h
                  </td>
                  <td className="px-3 py-2.5 text-right tnum text-[var(--amber)]">
                    {r.weekOtMs > 0 ? `${fmtHrs(r.weekOtMs)}h` : "—"}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr key={`${r.id}-detail`} className="bg-[var(--bg-canvas)]/40">
                    <td colSpan={days.length + 5} className="px-4 py-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {r.days
                          .filter((d) => d.totalMs > 0)
                          .map((d) => (
                            <div
                              key={d.date}
                              className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-3 py-2"
                            >
                              <span className="font-medium text-[var(--fg-default)]">
                                {fmtDay(d.date)}
                              </span>
                              <span className="tnum text-xs text-[var(--fg-muted)]">
                                {fmtHrs(d.sessionMs)}h prod
                                {d.otMs > 0 && (
                                  <span className="text-[var(--amber)]"> · +{fmtHrs(d.otMs)}h OT</span>
                                )}
                              </span>
                            </div>
                          ))}
                        {r.days.every((d) => d.totalMs === 0) && (
                          <div className="text-xs text-[var(--fg-muted)] py-2">
                            No tracked time this period.
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={days.length + 5} className="px-4 py-10 text-center text-[var(--fg-muted)]">
                  No employees match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}