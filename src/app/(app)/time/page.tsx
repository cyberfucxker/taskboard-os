import { guardPage } from "@/lib/pages";
import { myTimeLog, teamTimesheet, istDayStart } from "@/lib/time";
import { effectiveCapsForSession } from "@/lib/scope";
import { TimeReport } from "@/components/time/TimeReport";
import { TeamTimesheet } from "@/components/time/TeamTimesheet";
import { Users, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TimePage() {
  const session = await guardPage("Time");
  const days = await myTimeLog(session.user.id, 7);

  // Weekly category summary (productive seconds per task category).
  const catMs: Record<string, number> = {};
  for (const d of days) {
    for (const e of d.entries) {
      if (e.source !== "manual") catMs[e.category] = (catMs[e.category] ?? 0) + e.ms;
    }
  }
  const categorySummary = Object.entries(catMs)
    .map(([category, ms]) => ({ category, hrs: +(ms / 3600000).toFixed(2) }))
    .sort((a, b) => b.hrs - a.hrs);

  // Leadership only: previous 7 days across every employee. `hrms.view` is the
  // same capability that gates the HRMS module's own team-wide views — a plain
  // employee must never see other employees' time/productivity data.
  const caps = await effectiveCapsForSession(session);
  const canViewTeam = caps.has("hrms.view") || caps.has("hrms.manage");
  const today = istDayStart(new Date());
  const from = new Date(today.getTime() - 6 * 24 * 3600 * 1000);
  const to = today;
  const team = canViewTeam ? await teamTimesheet({ from, to }) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--fg-default)]">
            Time & Productivity
          </h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            Shift-aware tracking (09:30–18:30 IST) · lunch auto-excluded · overtime flagged
          </p>
        </div>
      </div>

      {/* Team overview — previous days per employee (leadership only) */}
      {canViewTeam && team && (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg-default)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-bg)]">
              <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
            </span>
            Team Timesheet — last 7 days
          </h2>
          <TeamTimesheet rows={team.rows} days={team.days} />
        </section>
      )}

      {/* My own report */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg-default)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-bg)]">
            <Clock className="h-3.5 w-3.5 text-[var(--accent)]" />
          </span>
          My Time & Productivity Record
        </h2>
        <TimeReport days={days} categorySummary={categorySummary} />
      </section>
    </div>
  );
}