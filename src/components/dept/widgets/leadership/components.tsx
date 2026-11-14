import { cache } from "react";
import Link from "next/link";
import type { StatTileData } from "@/lib/dept-metrics";
import { clientsAtRisk, departmentRollup, idlePeople } from "@/lib/dept-metrics-leadership";
import type { DeptWidgetProps } from "../../types";
import { EmptyBlock, LINK_CLS, StatTile } from "../../ui";
import { ClientLink, MoreLink, PersonLink, Pill, ResultView, ROW_CLS, plural } from "../lane-d-kit";

const getRollup = cache(departmentRollup);
const getIdle = cache(idlePeople);
const getRisk = cache(clientsAtRisk);

/** A figure that links to the filtered task list; zero is quiet, anything else carries a tone. */
function Figure({ n, href, tone, label }: { n: number | null; href: string; tone?: "crimson" | "amber"; label: string }) {
  if (n === null) return <span className="text-muted" aria-label={`${label}: not reported`}>-</span>;
  const colour = n > 0 && tone ? (tone === "crimson" ? "text-crimson" : "text-amber") : n === 0 ? "text-muted" : "text-ink";
  return (
    <Link href={href} className={`tabular-nums ${colour} ${LINK_CLS}`} aria-label={`${label}: ${n}`}>
      {n}
    </Link>
  );
}

/* ------------------------------------------------------------- stat tiles */

export async function LeadershipStats({ scope, userId }: DeptWidgetProps) {
  const [roll, risk] = await Promise.all([getRollup(userId, scope), getRisk(userId, scope)]);
  if (roll.state !== "ok") {
    return (
      <div>
        <EmptyBlock
          title={roll.state === "denied" ? "The company roll-up is not available for your role" : "Could not load the roll-up"}
          hint={roll.state === "denied" ? roll.reason : "Refresh to try again."}
        />
      </div>
    );
  }
  const t = roll.data.totals;
  const tiles: StatTileData[] = [
    { label: "Open tasks", value: String(t.open), href: "/tasks", hint: "across all departments" },
    { label: "Overdue", value: String(t.overdue), href: "/tasks", tone: t.overdue > 0 ? "bad" : "good", hint: t.overdue > 0 ? "past due date" : "none late" },
    { label: "Blocked", value: String(t.blocked), href: "/tasks", tone: t.blocked > 0 ? "bad" : "good", hint: t.blocked > 0 ? "waiting on something" : "nothing stuck" },
    {
      label: "Clients at risk", value: risk.state === "ok" ? String(risk.data.totalOverdueClients) : "-", href: "/clients",
      tone: risk.state === "ok" && risk.data.totalOverdueClients > 0 ? "warn" : "default", hint: "with overdue work",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((x) => <StatTile key={x.label} tile={x} />)}
    </div>
  );
}

/* ------------------------------------------------------ department roll-up */

export async function DepartmentRollup({ scope, userId }: DeptWidgetProps) {
  const r = await getRollup(userId, scope);
  return (
    <ResultView title="Departments" result={r} href="/tasks" hrefLabel="Open tasks">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title="No departments yet" />
        ) : (
          <>
            {/* Wide screens: a table. Phones: stacked cards (see the md:hidden block below). */}
            <div className="mt-1 hidden md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] font-medium text-muted">
                    <th scope="col" className="py-2 font-semibold">Department</th>
                    <th scope="col" className="py-2 text-right font-semibold">People</th>
                    <th scope="col" className="py-2 text-right font-semibold">Open</th>
                    <th scope="col" className="py-2 text-right font-semibold">Overdue</th>
                    <th scope="col" className="py-2 text-right font-semibold">Blocked</th>
                    <th scope="col" className="py-2 text-right font-semibold">Idle today</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.rows.map((x) => (
                    <tr key={x.id}>
                      <th scope="row" className="py-2.5 text-left font-normal">
                        <Link href={`/dept/${x.slug}`} className={`text-ink ${LINK_CLS}`}>{x.name}</Link>
                      </th>
                      <td className="py-2.5 text-right tabular-nums text-ink2">{x.people}</td>
                      <td className="py-2.5 text-right"><Figure n={x.open} href={x.href} label={`${x.name} open`} /></td>
                      <td className="py-2.5 text-right"><Figure n={x.overdue} href={x.overdueHref} tone="crimson" label={`${x.name} overdue`} /></td>
                      <td className="py-2.5 text-right"><Figure n={x.blocked} href={x.href} tone="crimson" label={`${x.name} blocked`} /></td>
                      <td className="py-2.5 text-right"><Figure n={x.idle} href={`/dept/${x.slug}`} tone="amber" label={`${x.name} idle`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-1 divide-y divide-line md:hidden">
              {d.rows.map((x) => (
                <li key={x.id} className="py-3">
                  <Link href={`/dept/${x.slug}`} className={`text-[13px] font-medium text-ink ${LINK_CLS}`}>{x.name}</Link>
                  <dl className="mt-1.5 grid grid-cols-4 gap-2 text-[12px]">
                    {[
                      { k: "Open", n: x.open, href: x.href, tone: undefined },
                      { k: "Overdue", n: x.overdue, href: x.overdueHref, tone: "crimson" as const },
                      { k: "Blocked", n: x.blocked, href: x.href, tone: "crimson" as const },
                      { k: "Idle", n: x.idle, href: `/dept/${x.slug}`, tone: "amber" as const },
                    ].map((c) => (
                      <div key={c.k}>
                        <dt className="text-muted">{c.k}</dt>
                        <dd className="mt-0.5 text-[15px]"><Figure n={c.n} href={c.href} tone={c.tone} label={`${x.name} ${c.k}`} /></dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="pt-2 text-[12px] text-muted">
              Idle means working staff with no work session started today.
              {d.weekOff ? " Sunday is a weekly off, so idle is not reported." : ""}
            </p>
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ clients at risk */

export async function ClientsAtRisk({ scope, userId }: DeptWidgetProps) {
  const r = await getRisk(userId, scope);
  return (
    <ResultView title="Clients at risk" result={r} href="/clients" hrefLabel="Open clients">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title="No client has overdue work" hint="Clients with the most overdue tasks appear here." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {d.rows.map((c) => (
                <li key={c.id} className={ROW_CLS}>
                  <span className="min-w-0 text-[13px]"><ClientLink id={c.id} name={c.name} /></span>
                  <span className="flex flex-wrap items-baseline gap-x-3 text-[12px] text-muted">
                    {c.health !== "HEALTHY" && <Pill text={c.health === "AT_RISK" ? "At risk" : "Watch"} tone={c.health === "AT_RISK" ? "crimson" : "amber"} />}
                    <span className="tabular-nums text-crimson">{c.overdue} overdue</span>
                    <span className="tabular-nums">of {c.open} open · oldest {c.worstDays}d</span>
                  </span>
                </li>
              ))}
            </ul>
            <MoreLink shown={d.rows.length} total={d.totalOverdueClients} href="/clients" noun="clients" />
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ idle people */

export async function IdleToday({ scope, userId }: DeptWidgetProps) {
  const r = await getIdle(userId, scope);
  return (
    <ResultView title="Idle today" result={r} href="/team" hrefLabel="Open team">
      {(d) => {
        if (d.weekOff) return <EmptyBlock title="Weekly off" hint="Idle people are not reported on Sundays." />;
        if (d.total === 0) return <EmptyBlock title="Everyone has started work" hint={`${plural(d.working, "person", "people")} working today, all with a session started.`} />;
        return (
          <>
            <p className="mt-1 text-[12px] text-muted">
              {d.total} of {d.working} working staff have not started a task today.
            </p>
            <ul className="mt-1 divide-y divide-line">
              {d.list.map((p) => (
                <li key={p.id} className={ROW_CLS}>
                  <span className="text-[13px]"><PersonLink id={p.id} name={p.name} /></span>
                  <span className="text-[12px] text-muted">
                    {p.department ?? "No department"} · {plural(p.openTasks, "open task")}
                  </span>
                </li>
              ))}
            </ul>
            <MoreLink shown={d.list.length} total={d.total} href="/team" noun="people" />
          </>
        );
      }}
    </ResultView>
  );
}
