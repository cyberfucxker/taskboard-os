"use client";

import { openTask } from "@/lib/task-drawer";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Pause, CheckCircle2, Bell, ArrowRight } from "lucide-react";
import { SectionLabel, Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";

type CEmployee = {
  id: string; name: string; role: string; dept?: string | null;
  openTasks: number; running: number; doneWeek: number;
  blocked: number; weekHrs: string; lastAction?: string | null;
  blockers: Array<{ code: string; title: string; reason?: string | null; since?: string | null }>;
};

type CProject = {
  id: string; name: string; client?: string | null; status?: string | null;
  total: number; done: number; blocked: number;
  members: Array<{ id: string; name: string }>;
  open: Array<{ id: string; code: string; title: string; status: string }>;
};

export function ControlPanel({
  employees, projects,
}: { employees: CEmployee[]; projects: CProject[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  async function act(taskId: string, action: string, extra?: Record<string, unknown>, key = taskId) {
    setBusy(key);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || `Action failed (${res.status})`, "error");
        return;
      }
      router.refresh();
    } catch {
      toast("Action failed — check your connection", "error");
    } finally {
      setBusy(null);
    }
  }

  async function nudge(employeeId: string) {
    setBusy(`nudge-${employeeId}`);
    try {
      const res = await fetch("/api/control/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          message: note[employeeId] || "Leadership is checking in — anything you need help unblocking?",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || `Could not send nudge (${res.status})`, "error");
        return;
      }
      toast("Nudge sent", "success");
      router.refresh();
    } catch {
      toast("Could not send nudge — check your connection", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Employees */}
      <section>
        <SectionLabel>Employees · {employees.length}</SectionLabel>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {employees.length === 0 ? (
            <p className="text-[13px] text-muted">No employees</p>
          ) : employees.map((e) => (
            <div key={e.id} className="rounded-lg border border-edge bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/directory`} className="truncate text-sm font-semibold text-ink hover:text-tealhi">
                  {e.name}
                </Link>
                <Badge text={e.role} />
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{e.dept ?? "—"} · {e.weekHrs}h this week</div>

              {/* stat chips */}
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[12px]">
                <StatChip label="Open" value={e.openTasks} tone="ink" />
                <StatChip label="Running" value={e.running} tone="teal" pulse={e.running > 0} />
                <StatChip label="Done wk" value={e.doneWeek} tone="green" />
                <StatChip label="Blocked" value={e.blocked} tone={e.blocked > 0 ? "amber" : "muted"} />
              </div>

              {e.blockers.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-edge pt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-amber">Blockers needing attention</div>
                  {e.blockers.slice(0, 2).map((b) => (
                    <div key={b.code} className="flex items-center gap-2 text-[12px]">
                      <button onClick={() => openTask(b.code)} className="font-mono text-ink hover:underline">{b.code}</button>
                      <span className="truncate text-muted">{b.reason ?? b.title} {b.since ? `· ${b.since}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* inline actions */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <input
                  value={note[e.id] ?? ""}
                  onChange={(ev) => setNote((n) => ({ ...n, [e.id]: ev.target.value }))}
                  placeholder="nudge note…"
                  className="min-w-0 flex-1 rounded border border-edge bg-bg px-2 py-1 text-[12px] text-ink placeholder:text-muted focus:border-edge"
                />
                <button
                  onClick={() => nudge(e.id)}
                  disabled={busy === `nudge-${e.id}` || !note[e.id]}
                  className="rounded bg-teal/15 px-2 py-1 text-[11px] font-semibold text-tealhi hover:bg-teal/25 disabled:opacity-40"
                >
                  <Bell className="mr-1 inline h-3 w-3" /> Nudge
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section>
        <SectionLabel>Projects · {projects.length}</SectionLabel>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {projects.length === 0 ? (
            <p className="text-[13px] text-muted">No projects</p>
          ) : projects.map((p) => (
            <div key={p.id} className="rounded-lg border border-edge bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/projects/${p.id}`} className="truncate text-sm font-semibold text-ink hover:text-tealhi">
                  {p.name}
                </Link>
                <span className="font-mono text-[11px] text-muted">{p.client ?? ""} · {p.done}/{p.total}</span>
              </div>

              {/* progress bar */}
              {p.total > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hover">
                  <div className="h-full bg-tealhi" style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {p.members.map((m) => (
                  <span key={m.id} className="rounded bg-hover px-1.5 py-0.5 text-muted">{m.name.split(" ")[0]}</span>
                ))}
                {p.status && <span className="ml-auto text-muted">{p.status}</span>}
              </div>

              {p.open.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-edge pt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Open</div>
                  {p.open.slice(0, 4).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-[12px]">
                      <button onClick={() => openTask(t.code)} className="font-mono text-ink hover:underline">{t.code}</button>
                      <span className="truncate text-muted">{t.title}</span>
                      <button
                        onClick={() => act(t.id, "status", { status: "DONE" })}
                        disabled={busy === t.id}
                        className="ml-auto shrink-0 rounded bg-emerald/15 px-1.5 py-0.5 text-[10px] text-emerald hover:bg-emerald/25 disabled:opacity-40"
                        title="Mark done"
                      ><CheckCircle2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatChip({ label, value, tone, pulse }: {
  label: string; value: number; tone: "ink" | "teal" | "green" | "amber" | "muted"; pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    ink: "text-ink", teal: "text-tealhi", green: "text-emerald", amber: "text-amber", muted: "text-muted",
  };
  return (
    <div className="flex items-center justify-between rounded border border-edge bg-bg px-2 py-1">
      <span className="font-mono text-[10px] text-muted">{label}</span>
      <span className={`flex items-center gap-1 font-mono text-[13px] ${tones[tone]}`}>
        {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tealhi" />}
        {value}
      </span>
    </div>
  );
}