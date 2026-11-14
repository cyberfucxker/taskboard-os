import { cache } from "react";
import Link from "next/link";
import type { StatTileData } from "@/lib/dept-metrics";
import {
  followUpsToday, pipelineByStage, repConversion, sourceQuality, untouchedLeads,
} from "@/lib/dept-metrics-sales";
import type { DeptWidgetProps } from "../../types";
import { EmptyBlock, LINK_CLS, StatTile } from "../../ui";
import {
  Bar, LeadLink, MoreLink, PersonLink, Pill, ResultView, ROW_CLS, humanise, plural,
} from "../lane-d-kit";

// One query per request even when both a tile row and a list use the same metric.
const getFollowUps = cache(followUpsToday);
const getUntouched = cache(untouchedLeads);
const getPipeline = cache(pipelineByStage);
const getReps = cache(repConversion);
const getSources = cache(sourceQuality);

/* ------------------------------------------------------------- stat tiles */

export async function SalesStats({ departmentId, scope, userId }: DeptWidgetProps) {
  const [fu, un, pl, reps] = await Promise.all([
    getFollowUps(userId, scope, departmentId), getUntouched(userId, scope, departmentId), getPipeline(userId, scope, departmentId), getReps(userId, scope, departmentId),
  ]);
  if (fu.state !== "ok" || un.state !== "ok" || pl.state !== "ok" || reps.state !== "ok") {
    const denied = [fu, un, pl, reps].find((r) => r.state === "denied");
    return (
      <div>
        <EmptyBlock
          title={denied ? "Sales numbers are not available for your role" : "Could not load the sales summary"}
          hint={denied && denied.state === "denied" ? denied.reason : "Refresh to try again."}
        />
      </div>
    );
  }
  const open = pl.data.stages.filter((s) => !s.isWon && !s.isLost).reduce((n, s) => n + s.count, 0);
  const tiles: StatTileData[] = [
    {
      label: "Follow-ups due", value: String(fu.data.total), href: "/crm/follow-ups",
      tone: fu.data.overdue > 0 ? "bad" : fu.data.total > 0 ? "warn" : "good",
      hint: fu.data.overdue > 0 ? `${fu.data.overdue} overdue` : "today and earlier",
    },
    {
      label: "Untouched 24h+", value: String(un.data.total), href: "/crm/leads",
      tone: un.data.total > 0 ? "warn" : "good", hint: un.data.total > 0 ? "call these first" : "all leads worked",
    },
    { label: "Open in pipeline", value: String(open), href: pl.data.href, hint: pl.data.pipelineName },
    {
      label: "Won, last 30 days", value: String(reps.data.totalWon), href: "/crm/leads", tone: "good",
      hint: `of ${reps.data.totalLeads} new leads`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => <StatTile key={t.label} tile={t} />)}
    </div>
  );
}

/* ------------------------------------------------------ follow-ups due */

export async function FollowUpsDue({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getFollowUps(userId, scope, departmentId);
  return (
    <ResultView title="Follow-ups due today" result={r} href="/crm/follow-ups">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title="No follow-ups due" hint="Pending follow-ups for today and earlier appear here, soonest first." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {d.rows.map((f) => (
                <li key={f.id} className={ROW_CLS}>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <LeadLink id={f.leadId} name={f.leadName} company={f.company} />
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{f.title}</span>
                  </span>
                  <span className="flex items-baseline gap-x-3 text-[12px] text-muted">
                    {scope === "all" && <PersonLink id={f.ownerId} name={f.ownerName} />}
                    {f.overdue ? <Pill text={`Overdue ${f.dueLabel}`} tone="crimson" /> : <span className="tabular-nums text-ink2">{f.dueLabel}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <MoreLink shown={d.rows.length} total={d.total} href="/crm/follow-ups" noun="follow-ups" />
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ untouched leads */

export async function UntouchedLeads({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getUntouched(userId, scope, departmentId);
  return (
    <ResultView title="Leads untouched for 24h+" result={r} href="/crm/leads" hrefLabel="Open leads">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title="Every lead has been worked in the last day" hint="Open leads with no activity for over 24 hours appear here, oldest first." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {d.rows.map((l) => (
                <li key={l.id} className={ROW_CLS}>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <LeadLink id={l.id} name={l.name} company={l.company} />
                    <span className="mt-0.5 block text-[12px] text-muted">{humanise(l.source)}</span>
                  </span>
                  <span className="flex items-baseline gap-x-3 text-[12px] text-muted">
                    {scope === "all" && <PersonLink id={l.ownerId} name={l.ownerName} />}
                    <Pill text={`Idle ${l.idleFor}`} tone="amber" />
                  </span>
                </li>
              ))}
            </ul>
            <MoreLink shown={d.rows.length} total={d.total} href="/crm/leads" noun="leads" />
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ pipeline by stage */

export async function PipelineStages({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getPipeline(userId, scope, departmentId);
  const href = r.state === "ok" ? r.data.href : undefined;
  return (
    <ResultView title="Pipeline by stage" result={r} href={href} hrefLabel="Open pipeline">
      {(d) => {
        if (d.stages.length === 0) return <EmptyBlock title="No pipeline set up yet" hint="Stages appear here once the sales pipeline is configured in the CRM." />;
        if (d.total === 0) return <EmptyBlock title="No leads in the pipeline" hint="Leads show up here by stage as they are added." />;
        const max = Math.max(1, ...d.stages.map((s) => s.count));
        return (
          <ul className="divide-y divide-line">
            {d.stages.map((s) => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <Link href={d.href} className={`truncate text-ink ${LINK_CLS}`}>{s.name}</Link>
                  <span className="shrink-0 tabular-nums text-ink2">
                    {s.count}
                    {d.showValue && s.valueInr ? <span className="text-muted"> · {inrShort(s.valueInr)}</span> : null}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar pct={(s.count / max) * 100} tone={s.isWon ? "emerald" : s.isLost ? "muted" : "teal"} label={`${s.name}: ${s.count} leads`} />
                </div>
              </li>
            ))}
          </ul>
        );
      }}
    </ResultView>
  );
}

/** Deal values are whole rupees. Compact lakh/crore, no locale APIs. */
function inrShort(rupees: number): string {
  if (rupees >= 10000000) return `₹${Math.round((rupees / 10000000) * 100) / 100} Cr`;
  if (rupees >= 100000) return `₹${Math.round((rupees / 100000) * 100) / 100} L`;
  return `₹${String(Math.round(rupees)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/* ------------------------------------------------------ per-rep conversion */

export async function RepConversion({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getReps(userId, scope, departmentId);
  return (
    <ResultView title="Conversion by rep" result={r} href="/crm/leads" hrefLabel="Open leads">
      {(d) =>
        d.reps.length === 0 ? (
          <EmptyBlock title={`No new leads in the last ${d.windowDays} days`} hint="Won leads divided by new leads, per assigned rep." />
        ) : (
          <>
            <p className="mt-1 text-[12px] text-muted">New leads from the last {d.windowDays} days, and how many were won.</p>
            <ul className="mt-1 divide-y divide-line">
              {d.reps.map((p) => (
                <li key={p.id ?? "none"} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <PersonLink id={p.id} name={p.name} />
                    <span className="shrink-0 tabular-nums text-ink2">
                      {p.won} of {p.leads} won · {p.ratePct}%
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar pct={p.ratePct} tone="emerald" label={`${p.name}: ${p.ratePct} percent converted`} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ lead source quality */

export async function SourceQuality({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getSources(userId, scope, departmentId);
  return (
    <ResultView title="Lead source quality" result={r} href="/crm/leads" hrefLabel="Open leads">
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyBlock title={`No leads in the last ${d.windowDays} days`} hint="Meta campaigns and forms, ranked by how many leads qualify." />
        ) : (
          <>
            <p className="mt-1 text-[12px] text-muted">
              {d.kind === "meta" ? "Meta campaign and form" : "By source"} · last {d.windowDays} days · share that reached qualified or won
            </p>
            <ul className="mt-1 divide-y divide-line">
              {d.rows.map((s) => (
                <li key={`${s.label}|${s.sublabel ?? ""}`} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-ink">
                      {d.kind === "source" ? humanise(s.label) : s.label}
                      {s.sublabel ? <span className="text-muted"> · {s.sublabel}</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink2">
                      {plural(s.leads, "lead")} · {s.qualifiedPct}% qualified
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar pct={s.qualifiedPct} tone={s.qualifiedPct >= 30 ? "emerald" : s.qualifiedPct >= 10 ? "teal" : "amber"} label={`${s.label}: ${s.qualifiedPct} percent qualified`} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </ResultView>
  );
}
