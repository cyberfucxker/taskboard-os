"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Mail,
  Phone,
  MessageSquare,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  LayoutGrid,
  Table as TableIcon,
  ChevronRight,
  Shield,
  Send,
  X,
  Zap,
} from "lucide-react";
import { Card, Badge, SectionLabel, Avatar, Dot } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import { useToast } from "@/components/Toast";
import { openTask } from "@/lib/task-drawer";
import { cn } from "@/lib/cn";
import { ListToolbar, NoMatches, StickyList, useListFilter } from "@/components/list";

export interface DirectoryEmployee {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
  status: string;
  department: { id: string; name: string; color: string } | null;
  manager: { id: string; name: string } | null;
  weeklyCapacityHrs: number | null;
  openTasksCount: number;
  currentRunningTask: {
    id: string;
    code: string;
    title: string;
    startedAt: string;
  } | null;
}

export function DirectoryHub({
  employees,
  canNudge = false,
}: {
  employees: DirectoryEmployee[];
  canNudge?: boolean;
}) {
  const toast = useToast();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [nudgeTarget, setNudgeTarget] = useState<DirectoryEmployee | null>(null);
  const [nudgeNote, setNudgeNote] = useState("");
  const [nudging, setNudging] = useState(false);

  // Extract unique departments
  const departments = Array.from(
    new Set(employees.map((e) => e.department?.name).filter(Boolean))
  ) as string[];

  const inShiftCount = employees.filter((e) => Boolean(e.currentRunningTask)).length;

  const byFilters = useMemo(
    () =>
      employees.filter((e) => {
        const matchesDept = deptFilter === "ALL" || e.department?.name === deptFilter;
        const matchesStatus =
          statusFilter === "ALL"
            ? true
            : statusFilter === "IN_SHIFT"
            ? Boolean(e.currentRunningTask)
            : e.status === statusFilter;
        return matchesDept && matchesStatus;
      }),
    [employees, deptFilter, statusFilter]
  );
  const pf = useListFilter(byFilters, (e) =>
    [e.name, e.email, e.title, e.department?.name, e.manager?.name, e.role, e.currentRunningTask?.title, e.currentRunningTask?.code]
      .filter(Boolean)
      .join(" ")
  );
  const filtered = pf.filtered;

  async function handleSendNudge(e: React.FormEvent) {
    e.preventDefault();
    if (!nudgeTarget) return;

    setNudging(true);
    try {
      const res = await fetch("/api/control/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: nudgeTarget.id,
          message: nudgeNote || "Checking in from team directory — how is your current task progressing?",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to send nudge");

      toast(`Nudge sent to ${nudgeTarget.name}`, "success");
      setNudgeTarget(null);
      setNudgeNote("");
    } catch (err: any) {
      toast(err.message || "Failed to send nudge", "error");
    } finally {
      setNudging(false);
    }
  }

  return (
    <StickyList
      header={
        <div className="flex h-12 items-center border-b border-line px-4">
          <h1 className="text-[14px] font-semibold tracking-tight text-ink">Directory</h1>
        </div>
      }
      toolbar={
        <ListToolbar filter={pf} shown={filtered.length} total={employees.length} noun="people" placeholder="Filter by name, title, department, email…">
          {/* Status filters */}
          <button
            onClick={() => setStatusFilter("ALL")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] tnum transition",
              statusFilter === "ALL"
                ? "bg-teal text-white font-medium"
                : "border border-edge bg-raised text-muted hover:text-ink"
            )}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter("IN_SHIFT")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] tnum transition",
              statusFilter === "IN_SHIFT"
                ? "bg-emerald text-white font-semibold"
                : "border border-edge bg-raised text-emerald hover:bg-emerald/10"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            Working Now ({inShiftCount})
          </button>

          <div className="h-4 w-[1px] bg-hover mx-1" />

          {/* Department filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-edge bg-raised px-3 py-1.5 tnum text-[11px] text-ink outline-none focus:border-teal"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </ListToolbar>
      }
    >
    <div className="mx-auto max-w-[1400px] space-y-6 p-5">

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
        <span><span className="tnum text-ink">{employees.length}</span> people</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald" /><span className="tnum text-ink">{inShiftCount}</span> working now</span>
        <span><span className="tnum text-ink">{departments.length}</span> departments</span>
        <span><span className="tnum text-ink">{employees.reduce((s, e) => s + (e.weeklyCapacityHrs ?? 40), 0)}h</span> weekly capacity</span>
      </div>

      {/* People — airy rows */}
      <div>
        <div className="flex items-center gap-1.5 border-b border-line pb-2 text-[12px] font-medium text-muted">
          People <span className="tnum text-faint">{filtered.length}</span>
        </div>
        {filtered.map((emp) => {
          const isWorking = Boolean(emp.currentRunningTask);
          return (
            <div
              key={emp.id}
              className="flex min-h-[48px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-1 py-1.5 text-[13px] hover:bg-hover"
            >
              <div className="flex min-w-[200px] flex-1 items-center gap-3">
                <div className="relative">
                  <Avatar name={emp.name} size={28} />
                  {isWorking && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald" title="Currently working in shift" />
                  )}
                </div>
                <div className="min-w-0">
                  <Link href={`/team/${emp.id}`} className="block truncate font-medium text-ink hover:text-tealhi">
                    {emp.name}
                  </Link>
                  <div className="truncate text-[12px] text-muted">{emp.title || "Team Member"}</div>
                </div>
              </div>

              <div className="w-[170px] text-[12px]">
                <div className="truncate text-ink2" style={{ color: emp.department?.color || undefined }}>
                  {emp.department?.name || "General"}
                </div>
                <div className="truncate text-muted">{emp.manager?.name || "Leadership"}</div>
              </div>

              <div className="min-w-[160px] flex-1 text-[12px]">
                {isWorking && emp.currentRunningTask ? (
                  <button
                    type="button"
                    onClick={() => openTask(emp.currentRunningTask!.id)}
                    className="flex max-w-full items-center gap-2 text-left hover:underline underline-offset-2"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald" />
                    <span className="font-mono text-emerald">{emp.currentRunningTask.code}</span>
                    <span className="truncate text-ink2">{emp.currentRunningTask.title}</span>
                  </button>
                ) : (
                  <span className="text-muted">Idle</span>
                )}
              </div>

              <div className="flex items-center justify-end gap-1.5">
                <Link
                  href={`/tasks?assignee=${emp.id}`}
                  className="h-7 rounded-md px-2 text-[12px] leading-7 tnum text-muted hover:bg-hover hover:text-ink"
                >
                  {emp.openTasksCount} tasks
                </Link>
                <a
                  href={`mailto:${emp.email}`}
                  title="Send Email"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
                >
                  <Mail className="h-3.5 w-3.5" />
                </a>
                {canNudge && (
                  <button
                    onClick={() => setNudgeTarget(emp)}
                    className="h-7 rounded-md border border-edge bg-raised px-3 text-[13px] font-medium text-ink hover:bg-hover"
                  >
                    Nudge
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (pf.active ? <NoMatches filter={pf} /> : (
          <div className="flex flex-col items-center gap-2 py-12 text-[13px] text-muted">
            <Search className="h-4 w-4" />
            No employees match the current search or filters.
          </div>
        ))}
      </div>

      {/* Modal: Send Nudge */}
      {nudgeTarget && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[10px] border border-edge bg-raised p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-edge pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-tealhi" />
                <h2 className="text-[15px] font-semibold text-ink">
                  Send Operational Nudge to {nudgeTarget.name}
                </h2>
              </div>
              <button onClick={() => setNudgeTarget(null)} className="text-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendNudge} className="space-y-3.5">
              <div>
                <label className="mb-1 block tnum text-[11px] text-muted">NUDGE MESSAGE / DIRECTIVE</label>
                <textarea
                  value={nudgeNote}
                  onChange={(e) => setNudgeNote(e.target.value)}
                  rows={4}
                  placeholder={`Hi ${nudgeTarget.name.split(" ")[0]}, leadership is checking in on today's deliverables...`}
                  className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[13px] text-ink placeholder-faint outline-none focus:border-teal"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-edge">
                <button
                  type="button"
                  onClick={() => setNudgeTarget(null)}
                  className="rounded-lg border border-edge px-3.5 py-2 text-[12px] text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={nudging}
 className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {nudging ? "Sending..." : "Send Nudge Notification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </StickyList>
  );
}
