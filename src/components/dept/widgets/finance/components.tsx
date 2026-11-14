import { cache } from "react";
import Link from "next/link";
import type { StatTileData } from "@/lib/dept-metrics";
import { hoursVsBilled, invoicesDue, receivablesByClient } from "@/lib/dept-metrics-finance";
import type { DeptWidgetProps } from "../../types";
import { EmptyBlock, LINK_CLS, StatTile } from "../../ui";
import { Bar, ClientLink, MoreLink, Pill, ResultView, ROW_CLS, plural } from "../lane-d-kit";

const getReceivables = cache(receivablesByClient);
const getDue = cache(invoicesDue);
const getHours = cache(hoursVsBilled);

/* ------------------------------------------------------------- stat tiles */

export async function FinanceStats({ departmentId, scope, userId }: DeptWidgetProps) {
  const [rec, due, hrs] = await Promise.all([getReceivables(userId, scope, departmentId), getDue(userId, scope, departmentId), getHours(userId, scope, departmentId)]);
  if (rec.state !== "ok" || due.state !== "ok" || hrs.state !== "ok") {
    const denied = [rec, due, hrs].find((r) => r.state === "denied");
    return (
      <div>
        <EmptyBlock
          title={denied ? "Finance figures are not available for your role" : "Could not load the finance summary"}
          hint={denied && denied.state === "denied" ? denied.reason : "Refresh to try again."}
        />
      </div>
    );
  }
  const tiles: StatTileData[] = [
    { label: "Outstanding", value: rec.data.total, href: "/finance", hint: plural(rec.data.invoiceCount, "unpaid invoice") },
    {
      label: "Overdue", value: rec.data.overdueTotal, href: "/finance",
      tone: rec.data.overdueCount > 0 ? "bad" : "good", hint: rec.data.overdueCount > 0 ? plural(rec.data.overdueCount, "invoice") : "nothing late",
    },
    {
      label: "Due in 14 days", value: String(due.data.dueSoon), href: "/finance",
      tone: due.data.dueSoon > 0 ? "warn" : "default", hint: "invoices not yet late",
    },
    {
      label: "Projects on budget hours", value: String(hrs.data.withBudget), href: "/projects",
      hint: `of ${hrs.data.activeProjects} active projects`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => <StatTile key={t.label} tile={t} />)}
    </div>
  );
}

/* ------------------------------------------------------ receivables */

export async function ReceivablesByClient({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getReceivables(userId, scope, departmentId);
  return (
    <ResultView title="Receivables by client" result={r} href="/finance" hrefLabel="Open finance">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title="Nothing outstanding" hint="Sent and due invoices that are not yet paid appear here, grouped by client." />
        ) : (
          <>
            <p className="mt-1 text-[12px] text-muted">{d.total} outstanding across {plural(d.invoiceCount, "invoice")}</p>
            <ul className="mt-1 divide-y divide-line">
              {d.rows.map((c) => (
                <li key={c.clientId} className={ROW_CLS}>
                  <span className="min-w-0 text-[13px]"><ClientLink id={c.clientId} name={c.clientName} /></span>
                  <span className="flex flex-wrap items-baseline gap-x-3 text-[12px] text-muted">
                    {c.overdue && <Pill text={`${c.overdue} overdue`} tone="crimson" />}
                    <span className="tabular-nums text-ink2">{c.outstanding}</span>
                    <span className="tabular-nums">{plural(c.invoices, "invoice")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ invoices due */

export async function InvoicesDue({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getDue(userId, scope, departmentId);
  return (
    <ResultView title="Invoices due" result={r} href="/finance" hrefLabel="Open finance">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title="No invoices due soon" hint="Unpaid invoices that are late or due within 14 days appear here, earliest first." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {d.rows.map((i) => (
                <li key={i.id} className={ROW_CLS}>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <Link href="/finance" className={`text-ink ${LINK_CLS}`}>
                      <span className="mr-2 tnum text-[11px] text-muted">{i.number}</span>
                    </Link>
                    <ClientLink id={i.clientId} name={i.clientName} />
                  </span>
                  <span className="flex items-baseline gap-x-3 text-[12px] text-muted">
                    <span className="tabular-nums text-ink2">{i.amount}</span>
                    {i.overdueDays > 0 ? <Pill text={`${i.overdueDays}d late`} tone="crimson" /> : <span className="tabular-nums">due {i.dueLabel}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <MoreLink shown={d.rows.length} total={d.overdue + d.dueSoon} href="/finance" noun="invoices" />
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ hours vs billed */

export async function HoursVsBilled({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getHours(userId, scope, departmentId);
  return (
    <ResultView title="Project hours vs billed" result={r} href="/projects" hrefLabel="Open projects">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock
            title="No project has budgeted hours yet"
            hint={`Set budgeted hours on a project and this compares logged time with the budget and what has been invoiced. ${plural(d.activeProjects, "active project")} right now.`}
          />
        ) : (
          <ul className="divide-y divide-line">
            {d.rows.map((p) => (
              <li key={p.projectId} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[13px]">
                  <span className="min-w-0">
                    <Link href={`/projects/${p.projectId}`} className={`text-ink ${LINK_CLS}`}>{p.projectName}</Link>
                    <span className="text-muted"> · </span>
                    <ClientLink id={p.clientId} name={p.clientName} />
                  </span>
                  <span className="text-[12px] tabular-nums text-ink2">
                    {p.loggedHrs}h of {p.budgetHrs}h · {p.burnPct}%
                    <span className="text-muted"> · {p.billed ? `${p.billed} billed` : "not invoiced"}</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar
                    pct={p.burnPct}
                    tone={p.burnPct > 100 ? "crimson" : p.burnPct >= 85 ? "amber" : "teal"}
                    label={`${p.projectName}: ${p.burnPct} percent of budgeted hours used`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )
      }
    </ResultView>
  );
}
