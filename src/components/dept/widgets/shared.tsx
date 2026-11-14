import Link from "next/link";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import type { Capability } from "@/lib/rbac";
import { canSeeDeptLeads } from "@/lib/dept-access";
import {
  acrossDepartments, blockedTasks, deliverablesByClient, deptStats, dueThisWeek, getDeptById, hoursVsEstimate, metaLeadsByCampaign,
  overdueByClient, overdueTasks, personLoad, revisionsByClient, reviewQueue, safe, tasksByStatus, tasksHref,
  type ClientCount, type DeptKind, type TaskRow,
} from "@/lib/dept-metrics";
import type { DeptWidget, DeptWidgetProps } from "../types";
import {
  EmptyBlock, ErrorBlock, LINK_CLS, STATUS_VAR, StatTile, WidgetShell, fmtAge, fmtDay, fmtHrs,
} from "../ui";

/** Async server components satisfy the contract at runtime; React 18 types do not know that yet. */
export const asComponent = (c: unknown) => c as DeptWidget["Component"];

/** Lead widgets: crm.view AND the viewer's OWN department (COO rule - no cross-department lead data). */
const canLeadsFor = cache(async (departmentId: string): Promise<boolean> => {
  const s = (await getServerSession(authOptions)) as ScopedSession | null;
  if (!s?.user?.id) return false;
  const has = (await effectiveCapsForSession(s)).has("crm.view" as Capability);
  return canSeeDeptLeads(s.user, departmentId, has);
});

const rowCls = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5";

// ---- stat tiles (one component per dashboard kind) --------------------------

function makeStats(kind: DeptKind) {
  return async function StatTiles({ departmentId, scope, userId }: DeptWidgetProps) {
    const dept = await getDeptById(departmentId);
    if (!dept) return <ErrorBlock hint="Department not found." />;
    const canLeads = kind === "dm" ? await canLeadsFor(departmentId) : false;
    const r = await safe(() => deptStats(kind, dept, scope, userId, canLeads));
    if (r.error || !r.data) return <ErrorBlock />;
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {r.data.map((t) => <StatTile key={t.label} tile={t} />)}
      </div>
    );
  };
}
export const DevStats = makeStats("dev");
export const DesignStats = makeStats("design");
export const DmStats = makeStats("dm");
export const GenericStats = makeStats("generic");

// ---- tasks by status (the one chart) ----------------------------------------

export async function TasksByStatus({ departmentId, scope, userId }: DeptWidgetProps) {
  const dept = await getDeptById(departmentId);
  const r = await safe(() => tasksByStatus(departmentId, scope, userId));
  const title = "Tasks by status";
  if (!dept || r.error || !r.data) return <WidgetShell title={title}><ErrorBlock /></WidgetShell>;
  const total = r.data.reduce((a, s) => a + s.count, 0);
  return (
    <WidgetShell title={title} href={tasksHref({ deptName: dept.name, scope })}>
      {total === 0 ? (
        <EmptyBlock title="No tasks yet" hint="Tasks for this department will show here." />
      ) : (
        <>
          <div
            role="img"
            aria-label={r.data.map((s) => `${s.label} ${s.count}`).join(", ")}
            className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-raised"
          >
            {r.data.filter((s) => s.count > 0).map((s) => (
              <div key={s.status} style={{ width: `${(s.count / total) * 100}%`, background: STATUS_VAR[s.status] }} />
            ))}
          </div>
          <ul className="mt-3 divide-y divide-line">
            {r.data.map((s) => (
              <li key={s.status}>
                <Link
                  href={tasksHref({ deptName: dept.name, scope, status: s.status })}
                  className="flex items-center justify-between gap-3 py-2 text-[13px] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
                >
                  <span className="flex items-center gap-2 text-ink2">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_VAR[s.status] }} />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-ink">{s.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetShell>
  );
}

// ---- task list widgets --------------------------------------------------------

function TaskItem({ t, metaRight }: { t: TaskRow; metaRight: string }) {
  return (
    <li className={rowCls}>
      <span className="min-w-0 flex-1 text-[13px]">
        <Link href={`/tasks?task=${t.code}`} className={`text-ink ${LINK_CLS}`}>
          <span className="mr-2 font-mono text-[11px] text-muted">{t.code}</span>
          {t.title}
        </Link>
        {t.note && <span className="mt-0.5 block truncate text-[12px] text-muted">{t.note}</span>}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 text-[12px] text-muted">
        {t.client && <Link href={`/clients/${t.client.id}`} className={`text-ink2 ${LINK_CLS}`}>{t.client.name}</Link>}
        {t.assignee && <Link href={`/team/${t.assignee.id}`} className={`text-ink2 ${LINK_CLS}`}>{t.assignee.name}</Link>}
        <span className="tabular-nums">{metaRight}</span>
      </span>
    </li>
  );
}

function listWidget(opts: {
  title: string;
  load: (p: DeptWidgetProps) => Promise<TaskRow[]>;
  meta: (t: TaskRow) => string;
  empty: { title: string; hint?: string };
  href?: (deptName: string, scope: DeptWidgetProps["scope"]) => string;
}) {
  return async function TaskListWidget(p: DeptWidgetProps) {
    const dept = await getDeptById(p.departmentId);
    const r = await safe(() => opts.load(p));
    if (r.error || !r.data) return <WidgetShell title={opts.title}><ErrorBlock /></WidgetShell>;
    return (
      <WidgetShell title={opts.title} href={dept && opts.href ? opts.href(dept.name, p.scope) : undefined}>
        {r.data.length === 0 ? (
          <EmptyBlock {...opts.empty} />
        ) : (
          <ul className="divide-y divide-line">
            {r.data.map((t) => <TaskItem key={t.id} t={t} metaRight={opts.meta(t)} />)}
          </ul>
        )}
      </WidgetShell>
    );
  };
}

export const BlockedList = listWidget({
  title: "Blocked",
  load: (p) => blockedTasks(p.departmentId, p.scope, p.userId),
  meta: (t) => `stuck ${fmtAge(t.ageDays)}`,
  empty: { title: "Nothing is blocked", hint: "Blocked tasks and how long they have waited appear here." },
  href: (n, s) => tasksHref({ deptName: n, scope: s, status: "BLOCKED" }),
});

export const ReviewQueue = listWidget({
  title: "Needs review",
  load: (p) => reviewQueue(p.departmentId, p.scope, p.userId),
  meta: (t) => `waiting ${fmtAge(t.ageDays)}`,
  empty: { title: "Review queue is clear", hint: "Tasks moved to In review show up here." },
  href: (n, s) => tasksHref({ deptName: n, scope: s, status: "IN_REVIEW" }),
});

export const DueThisWeek = listWidget({
  title: "Due this week",
  load: (p) => dueThisWeek(p.departmentId, p.scope, p.userId, 10),
  meta: (t) => fmtDay(t.dueDate),
  empty: { title: "Nothing due this week" },
  href: (n, s) => tasksHref({ deptName: n, scope: s }),
});

export const OverdueList = listWidget({
  title: "Overdue",
  load: (p) => overdueTasks(p.departmentId, p.scope, p.userId),
  meta: (t) => `due ${fmtDay(t.dueDate)}`,
  empty: { title: "Nothing overdue", hint: "Open tasks past their due date appear here." },
});

// ---- per person load ----------------------------------------------------------

export async function PersonLoadWidget({ departmentId, scope, userId }: DeptWidgetProps) {
  const title = "Load per person";
  const r = await safe(() => personLoad(departmentId, scope, userId));
  if (r.error || !r.data) return <WidgetShell title={title}><ErrorBlock /></WidgetShell>;
  const max = Math.max(1, ...r.data.map((p) => p.open));
  return (
    <WidgetShell title={title}>
      {r.data.length === 0 ? (
        <EmptyBlock title="No people in this view" />
      ) : (
        <ul className="divide-y divide-line">
          {r.data.map((p) => (
            <li key={p.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <Link href={`/team/${p.id}`} className={`truncate text-ink ${LINK_CLS}`}>{p.name}</Link>
                <span className="shrink-0 tabular-nums text-ink2">
                  {p.open} open{p.overdue > 0 && <span className="text-crimson"> · {p.overdue} overdue</span>}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={`${p.name}: ${p.open} open tasks`}>
                <div className="h-full rounded-full" style={{ width: `${(p.open / max) * 100}%`, background: p.overdue > 0 ? "var(--amber)" : "var(--teal)" }} />
              </div>
              {p.estHrs > 0 && (
                <p className="mt-1 text-[12px] text-muted">
                  {fmtHrs(p.estHrs)} estimated{p.capacityHrs ? ` · ${fmtHrs(p.capacityHrs)} per week` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

// ---- hours vs estimate --------------------------------------------------------

export async function HoursVsEstimate({ departmentId, scope, userId }: DeptWidgetProps) {
  const title = "Hours vs estimate";
  const r = await safe(() => hoursVsEstimate(departmentId, scope, userId));
  if (r.error || !r.data) return <WidgetShell title={title}><ErrorBlock /></WidgetShell>;
  const { weekHrs, rows } = r.data;
  return (
    <WidgetShell title={title} href="/time" hrefLabel="Time log">
      {rows.length === 0 ? (
        <EmptyBlock title="No hours logged this week" hint="Tasks worked on this week, with logged hours against the estimate." />
      ) : (
        <>
          <p className="mt-1 text-[12px] text-muted">{fmtHrs(weekHrs)} logged this week</p>
          <ul className="mt-1 divide-y divide-line">
            {rows.map((h) => {
              const over = h.estimateHrs != null && h.totalHrs > h.estimateHrs;
              const pct = h.estimateHrs ? Math.min(100, (h.totalHrs / h.estimateHrs) * 100) : 0;
              return (
                <li key={h.taskId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <Link href={`/tasks?task=${h.code}`} className={`min-w-0 truncate text-ink ${LINK_CLS}`}>
                      <span className="mr-2 font-mono text-[11px] text-muted">{h.code}</span>{h.title}
                    </Link>
                    <span className={`shrink-0 tabular-nums ${over ? "text-crimson" : "text-ink2"}`}>
                      {fmtHrs(h.totalHrs)}{h.estimateHrs != null ? ` / ${fmtHrs(h.estimateHrs)}` : " / no estimate"}{over ? " (over)" : ""}
                    </span>
                  </div>
                  {h.estimateHrs != null && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--crimson)" : "var(--teal)" }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </WidgetShell>
  );
}

// ---- per client ---------------------------------------------------------------

export async function DeliverablesByClient({ departmentId, scope, userId }: DeptWidgetProps) {
  const title = "Deliverables by client";
  const dept = await getDeptById(departmentId);
  const r = await safe(() => deliverablesByClient(departmentId, scope, userId, 7));
  if (r.error || !r.data) return <WidgetShell title={title}><ErrorBlock /></WidgetShell>;
  return (
    <WidgetShell title={title} href={dept ? tasksHref({ deptName: dept.name, scope }) : undefined}>
      {r.data.length === 0 ? (
        <EmptyBlock title="No deliverables due" hint="Overdue and next-7-day work, grouped by client." />
      ) : (
        <ul className="divide-y divide-line">
          {r.data.map((c) => (
            <li key={c.clientId ?? "none"} className={rowCls}>
              <span className="min-w-0 text-[13px]">
                {c.clientId ? <Link href={`/clients/${c.clientId}`} className={`text-ink ${LINK_CLS}`}>{c.clientName}</Link> : <span className="text-ink2">{c.clientName}</span>}
              </span>
              <span className="text-[12px] tabular-nums text-muted">
                {c.due} due{c.overdue > 0 && <span className="text-crimson"> · {c.overdue} overdue</span>}
                {c.nextDue ? ` · next ${fmtDay(c.nextDue)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

function countsWidget(opts: {
  title: string; unit: string; load: (p: DeptWidgetProps) => Promise<ClientCount[]>;
  empty: { title: string; hint?: string }; tone: string;
}) {
  return async function ClientCountsWidget(p: DeptWidgetProps) {
    const r = await safe(() => opts.load(p));
    if (r.error || !r.data) return <WidgetShell title={opts.title}><ErrorBlock /></WidgetShell>;
    const max = Math.max(1, ...r.data.map((c) => c.count));
    return (
      <WidgetShell title={opts.title}>
        {r.data.length === 0 ? (
          <EmptyBlock {...opts.empty} />
        ) : (
          <ul className="divide-y divide-line">
            {r.data.map((c) => (
              <li key={c.clientId ?? "none"} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  {c.clientId ? <Link href={`/clients/${c.clientId}`} className={`truncate text-ink ${LINK_CLS}`}>{c.clientName}</Link> : <span className="text-ink2">{c.clientName}</span>}
                  <span className="shrink-0 tabular-nums text-ink2">{c.count} {opts.unit}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={`${c.clientName}: ${c.count} ${opts.unit}`}>
                  <div className="h-full rounded-full" style={{ width: `${(c.count / max) * 100}%`, background: opts.tone }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </WidgetShell>
    );
  };
}

export const OverdueByClient = countsWidget({
  title: "Overdue by client", unit: "overdue", tone: "var(--crimson)",
  load: (p) => overdueByClient(p.departmentId, p.scope, p.userId),
  empty: { title: "No overdue work", hint: "Open tasks past their due date, grouped by client." },
});

export const RevisionsByClient = countsWidget({
  title: "Revisions by client", unit: "in rework", tone: "var(--amber)",
  load: (p) => revisionsByClient(p.departmentId, p.scope, p.userId),
  empty: { title: "No open revisions", hint: "Tasks sent back with a rework reason, grouped by client." },
});

// ---- Meta leads by campaign / form -------------------------------------------

export async function MetaLeadsWidget({ departmentId, scope, userId }: DeptWidgetProps) {
  const title = "Meta leads by campaign";
  if (!(await canLeadsFor(departmentId))) {
    return <WidgetShell title={title}><EmptyBlock title="Lead data needs CRM access" hint="Shown to members of this department with CRM access." /></WidgetShell>;
  }
  const r = await safe(() => metaLeadsByCampaign(scope, userId));
  if (r.error || !r.data) return <WidgetShell title={title}><ErrorBlock /></WidgetShell>;
  const max = Math.max(1, ...r.data.map((l) => l.leads));
  return (
    <WidgetShell title={title} href="/crm/leads" hrefLabel="Open leads">
      {r.data.length === 0 ? (
        <EmptyBlock title="No Meta leads in the last 30 days" hint="Lead-ad leads grouped by campaign and form." />
      ) : (
        <ul className="divide-y divide-line">
          {r.data.map((l) => (
            <li key={`${l.campaign}|${l.form}`} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <Link href="/crm/leads" className={`min-w-0 truncate text-ink ${LINK_CLS}`}>
                  {l.campaign}<span className="text-muted"> · {l.form}</span>
                </Link>
                <span className="shrink-0 tabular-nums text-ink2">{l.leads} leads</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={`${l.campaign}: ${l.leads} leads`}>
                <div className="h-full rounded-full" style={{ width: `${(l.leads / max) * 100}%`, background: "var(--teal)" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

// ---- across departments -------------------------------------------------------

export async function AcrossDepartments({ departmentId, scope, userId }: DeptWidgetProps) {
  const title = "Across departments";
  const r = await safe(() => acrossDepartments(departmentId, scope, userId));
  if (r.error || !r.data) return <WidgetShell title={title}><ErrorBlock /></WidgetShell>;
  return (
    <WidgetShell title={title}>
      {r.data.length === 0 ? (
        <EmptyBlock title="No cross-department tasks" hint="Tasks owned by another department that involve someone here." />
      ) : (
        <ul className="divide-y divide-line">
          {r.data.map((t) => (
            <li key={t.code} className={rowCls}>
              <span className="min-w-0 flex-1 text-[13px]">
                <Link href={`/tasks?task=${t.code}`} className={`text-ink ${LINK_CLS}`}>
                  <span className="mr-2 font-mono text-[11px] text-muted">{t.code}</span>{t.title}
                </Link>
              </span>
              <span className="flex flex-wrap items-baseline gap-x-3 text-[12px] text-muted">
                <span className="text-ink2">{t.otherDept}</span>
                <span>{STATUS_LABEL[t.status] ?? t.status}</span>
                <span className="tabular-nums">{fmtDay(t.dueDate)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

const STATUS_LABEL: Record<string, string> = {
  TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done",
};
