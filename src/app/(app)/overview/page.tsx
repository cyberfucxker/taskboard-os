import { scopedTaskWhere } from "@/lib/scope";
import Link from "next/link";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { timeAgo, fmtCompact } from "@/lib/utils";
import { Card, Stat, Bar, SectionLabel, Dot, Avatar, Badge } from "@/components/ui";
import { getProgress } from "@/lib/progress";
import { EntityLink } from "@/components/entity/EntityLink";
import { meToday } from "@/lib/time";
import { fmtMs } from "@/lib/fmt";

export const dynamic = "force-dynamic";

const ACTIVITY_LABEL: Record<string, string> = {
  TASK_CREATED: "created task", TASK_COMPLETED: "completed", TASK_REOPENED: "reopened",
  TASK_STATUS_CHANGED: "moved", LEAD_STAGE_CHANGED: "moved lead", LEAD_CONVERTED: "converted lead",
  AUTH_LOGIN: "signed in", ROLE_SWITCHED: "switched view", SUBTASK_TOGGLED: "toggled",
};

export default async function OverviewPage() {
  const session = await guardPage("Overview");
  // Non-heads: only tasks they may see, and activity from their own department (scope.ts rule).
  const taskScope = await scopedTaskWhere(session);
  const scoped = Object.keys(taskScope).length > 0;
  const [
    metricValues, tasks, leads, empCount, activities, deptLoad, notices, progress,
  ] = await Promise.all([
    prisma.metricValue.findMany({ orderBy: { period: "desc" }, select: { id: true, metricKey: true, value: true, period: true } }),
    prisma.task.findMany({ where: { deletedAt: null, ...taskScope }, select: { id: true, code: true, status: true, priority: true, blocked: true, title: true } }),
    // Funnel from the CRM's default pipeline (stage names are editable in the pipeline manager).
    prisma.crmPipeline
      .findFirst({
        where: { isDefault: true },
        select: {
          stages: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, isWon: true, isLost: true, _count: { select: { leads: true } } },
          },
        },
      })
      .then((p) => p?.stages ?? []),
    prisma.employee.count({ where: { status: { in: ["ACTIVE", "PROBATION"] } } }),
    prisma.activity.findMany({ where: scoped ? (session.user.departmentId ? { actor: { departmentId: session.user.departmentId } } : { actor: { id: session.user.id } }) : {}, orderBy: { occurredAt: "desc" }, take: 8, select: { id: true, type: true, occurredAt: true, payload: true, entityType: true, actor: { select: { id: true, name: true } } } }),
    prisma.department.findMany({
      where: { deletedAt: null },
      select: { name: true, color: true, _count: { select: { tasks: true } } },
    }),
    // This page is intentionally universal (Overview: ["workspace.access"],
    // "non-commercial — revenue removed") — a company-wide pulse every
    // employee can see. Notifications are personal, not company data, and
    // must never be included in that "everyone sees this" surface.
    prisma.notification.findMany({ where: { read: false, employeeId: session.user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    getProgress(session),
  ]);

  const myDay = await meToday(session.user.id);

  const metrics = new Map<string, number>();
  for (const mv of metricValues) if (!metrics.has(mv.metricKey)) metrics.set(mv.metricKey, mv.value);

  const open = tasks.filter((t) => t.status !== "DONE");
  const blocked = tasks.filter((t) => t.blocked);
  const p0 = open.filter((t) => t.priority === "P0").length;
  const maxTasks = Math.max(1, ...deptLoad.map((d) => d._count.tasks));
  const maxTrend = Math.max(1, ...progress.trend.map((p) => p.count));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <Stat label="On-time delivery" value={`${metrics.get("delivery.on_time") ?? "—"}%`} accent="var(--emerald)" />
          <p className="mt-1 font-mono text-[10px] text-muted">target ≥ 90%</p>
        </Card>
        <Card className="p-4">
          <Stat label="Open tasks" value={open.length} accent={p0 > 0 ? "var(--crimson)" : "var(--ink)"} />
          <p className="mt-1 font-mono text-[10px] text-crimson">{p0 > 0 ? `${p0} P0 pending` : "no P0"}</p>
        </Card>
        <Card className="p-4">
          <Stat label="People (active)" value={empCount} />
          <p className="mt-1 font-mono text-[10px] text-muted">20–30 target cohort</p>
        </Card>
        <Card className="p-4">
          <Link href="/today" className="block">
            <Stat label="Your 8h" value={fmtMs(myDay.loggedMs)} accent={myDay.loggedMs >= myDay.goalMs ? "var(--emerald)" : "var(--tealhi)"} />
            <p className="mt-1 font-mono text-[10px] text-muted">
              {myDay.otMs > 0 ? `+${fmtMs(myDay.otMs)} OT` : myDay.running ? `on ${myDay.running.code}` : "target 8h"}
            </p>
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Dept load */}
        <Card className="p-4 lg:col-span-2">
          <SectionLabel>Delivery load by department</SectionLabel>
          <div className="mt-3 space-y-3">
            {deptLoad.map((d) => (
              <div key={d.name}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2 text-ink">
                    <Dot color={d.color} /> {d.name}
                  </span>
                  <span className="font-mono text-muted">{d._count.tasks} tasks</span>
                </div>
                <Bar pct={(d._count.tasks / maxTasks) * 100} color={d.color} />
              </div>
            ))}
          </div>
        </Card>

        {/* Activity feed from the event log */}
        <Card className="p-4">
          <SectionLabel>Recent activity</SectionLabel>
          <div className="mt-2 space-y-3">
            {activities.length === 0 && <p className="text-[12px] text-muted">No events yet — do something in Tasks or CRM.</p>}
            {activities.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5">
                <div className="mt-1 h-1.5 w-1.5 rounded-full shrink-0 bg-teal" />
                <div className="min-w-0">
                  <p className="text-[12px] text-ink">
                    <b>
                      {a.actor ? (
                        <EntityLink entity={{ type: "person", id: a.actor.id, name: a.actor.name }} />
                      ) : (
                        "System"
                      )}
                    </b>{" "}
                    <span className="text-muted">{ACTIVITY_LABEL[a.type] ?? a.type.toLowerCase()}</span>{" "}
                    {(a.payload as { code?: string } | null)?.code ? (
                      <Link
                        href={`/tasks?task=${(a.payload as { code: string }).code}`}
                        className="font-mono text-[11px] text-tealhi hover:text-ink"
                      >
                        {(a.payload as { code: string }).code}
                      </Link>
                    ) : (
                      <span className="font-mono text-[11px] text-muted">{String(a.entityType).toLowerCase()}</span>
                    )}
                  </p>
                  <p className="font-mono text-[10px] text-edge">{timeAgo(a.occurredAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Blockers */}
        <Card className="p-4">
          <SectionLabel>Blockers <span className="text-crimson">{blocked.length}</span></SectionLabel>
          <div className="mt-2 space-y-2.5">
            {blocked.length === 0 && <p className="text-[12px] text-muted">Nothing blocked. Nice.</p>}
            {blocked.slice(0, 5).map((t) => (
              <Link
                key={t.id}
                href={`/tasks?task=${t.code}`}
                className="block rounded-lg border border-crimson/25 bg-crimson/5 p-2.5 transition hover:border-crimson/40"
              >
                <div className="font-mono text-[10px] text-crimson">{t.code}</div>
                <div className="text-[12px] text-ink">{t.title}</div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Pipeline */}
        <Card className="p-4">
          <SectionLabel>Pipeline</SectionLabel>
          <div className="mt-2 space-y-2">
            {(() => {
              const total = leads.reduce((sum, s) => sum + s._count.leads, 0);
              return leads
                .filter((s) => !s.isLost)
                .map((s) => {
                  const n = s._count.leads;
                  const pct = total ? (n / total) * 100 : 0;
                  return (
                    <Link key={s.id} href={`/crm/leads?stageId=${s.id}`} className="flex items-center gap-2 text-[12px] hover:opacity-80">
                      <span className="w-24 truncate text-muted">{s.name}</span>
                      <div className="flex-1"><Bar pct={pct} color={s.isWon ? "var(--emerald)" : "var(--teal)"} /></div>
                      <span className="w-6 text-right font-mono text-ink">{n}</span>
                    </Link>
                  );
                });
            })()}
          </div>
        </Card>

        {/* Watch notices */}
        <Card className="p-4">
          <SectionLabel>Watch</SectionLabel>
          <div className="mt-2 space-y-2">
            {notices.length === 0 ? (
              <p className="text-[12px] text-muted">No priority alerts.</p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="flex items-start gap-2 text-[12px]">
                  <Dot color={n.severity === "Critical" ? "var(--crimson)" : "var(--amber)"} />
                  <span className="text-ink">{n.title}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ================= Progress / Leaderboard (mirrors old reports) ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <SectionLabel>
            Leaderboard — completion %
            {progress.scopeAll
              ? <span className="ml-1 font-normal text-muted">· everyone</span>
              : <span className="ml-1 font-normal text-muted">· your tasks</span>}
          </SectionLabel>
          <div className="mt-3 space-y-2.5">
            {progress.leaderboard.length === 0 && <p className="text-[12px] text-muted">No completed tasks to rank yet.</p>}
            {progress.leaderboard.map((row, i) => (
              <Link
                key={row.employeeId ?? i}
                href={row.employeeId ? `/tasks?assignee=${row.employeeId}` : "#"}
                className="flex items-center gap-3 text-[12px] hover:bg-bg"
              >
                <span className="w-5 text-center font-mono text-edge">{i + 1}</span>
                <Avatar name={row.name} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-ink">{row.name}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {row.done}/{row.total} · <b style={{ color: "var(--tealhi)" }}>{row.completionPercent}%</b>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1"><Bar pct={row.completionPercent} color="var(--tealhi)" /></div>
                    {row.dept && <span className="label" style={{ color: row.deptColor ?? "var(--muted)" }}>{row.dept}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {/* 14-day completion trend */}
          <Card className="p-4">
            <SectionLabel>Completion trend · 14d</SectionLabel>
            <div className="mt-3 flex h-20 items-end gap-1">
              {progress.trend.map((p) => (
                <div key={p.date} className="group flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-teal/60 transition group-hover:bg-tealhi"
                    style={{ height: `${Math.max(p.count ? 12 : 3, (p.count / (maxTrend || 1)) * 100)}%` }}
                    title={`${p.date}: ${p.count}`}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Priority distribution */}
          <Card className="p-4">
            <SectionLabel>By priority</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["P0", "P1", "P2", "P3"] as const).map((p) => (
                <Badge key={p} text={p} kind={p} />
              ))}
              <span className="ml-auto font-mono text-[11px] text-muted">
                {progress.priority.P0} · {progress.priority.P1} · {progress.priority.P2} · {progress.priority.P3}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}