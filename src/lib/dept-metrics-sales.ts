import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { crmAudience, resolveDataScope } from "@/crm-server/services/hierarchy";
import {
  authorizeDept, denied, fmtAge, fmtIstDate, fmtIstTime, guarded, istToday, ok,
  type Result, type Scope,
} from "@/lib/dept-metrics-common";

/**
 * Sales dashboard metrics. CRM access rules are the CRM's own (src/crm-server/services/hierarchy):
 * only Sales + Leadership reach the CRM; inside them everyone shares one funnel, and the
 * dashboard's Mine toggle narrows to leads assigned to the viewer. Hiring-pipeline leads are
 * applicants, never sales, so they are excluded everywhere here. Read-only.
 *
 * Link targets: the CRM screens do not parse URL filters, so tiles link to /crm/leads,
 * /crm/follow-ups (and /crm/pipeline/kanban for Leadership) and every lead links to /crm/leads/:id.
 */

interface SalesCtx {
  /** Employee ids (members of the viewed department) whose leads are visible. */
  ids: string[];
  includeUnassigned: boolean;
  isLeadership: boolean;
  leadWhere: Prisma.CrmLeadWhereInput;
}

const NO_CRM = "The CRM is for the Sales and Leadership departments.";

/**
 * Leads visible on this Sales dashboard: the viewer's CRM scope, further limited to leads owned by
 * members of the viewed department (plus unassigned leads, which belong to the shared sales funnel).
 * Returns the reason string when the viewer may not see it.
 */
async function salesContext(userId: string, scope: Scope, departmentId: string): Promise<SalesCtx | string> {
  const auth = await authorizeDept(userId, departmentId, "sales");
  if (!auth.ok) return auth.reason;
  const aud = await crmAudience(userId);
  if (!aud.allowed) return NO_CRM;
  const members = (
    await prisma.employee.findMany({ where: { departmentId, deletedAt: null }, select: { id: true } })
  ).map((m) => m.id);
  let ids: string[];
  if (scope === "mine") ids = members.includes(userId) ? [userId] : [];
  else {
    const ds = await resolveDataScope(userId);
    ids = ds.isAll ? members : members.filter((m) => ds.userIds.includes(m));
  }
  const includeUnassigned = scope === "all";
  const hiring = await prisma.crmPipeline.findFirst({ where: { name: "Hiring" }, select: { id: true } });
  const and: Prisma.CrmLeadWhereInput[] = [];
  and.push(includeUnassigned ? { OR: [{ assignedUserId: { in: ids } }, { assignedUserId: null }] } : { assignedUserId: { in: ids } });
  if (hiring) and.push({ OR: [{ pipelineId: null }, { pipelineId: { not: hiring.id } }] });
  return { ids, includeUnassigned, isLeadership: aud.isLeadership, leadWhere: and.length ? { AND: and } : {} };
}

async function nameMap(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!uniq.length) return new Map();
  const rows = await prisma.employee.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

const leadName = (l: { firstName: string; lastName: string }) => `${l.firstName} ${l.lastName}`.trim();

/* ------------------------------------------------- Follow-ups due today */

export interface FollowUpRow {
  id: string;
  leadId: string;
  leadName: string;
  company: string | null;
  title: string;
  /** "3:30 PM" for today, "5 Oct" for earlier days. */
  dueLabel: string;
  overdue: boolean;
  ownerId: string | null;
  ownerName: string | null;
}
export interface FollowUpsToday { total: number; overdue: number; rows: FollowUpRow[] }

export function followUpsToday(userId: string, scope: Scope, departmentId: string): Promise<Result<FollowUpsToday>> {
  return guarded("sales.followUps", async () => {
    const ctx = await salesContext(userId, scope, departmentId);
    if (typeof ctx === "string") return denied(ctx);
    const day = istToday();
    const where: Prisma.CrmFollowUpWhereInput = {
      completed: false,
      status: { in: ["pending", "rescheduled"] },
      dueAt: { lt: day.end },
      lead: ctx.leadWhere,
      ...(scope === "mine" ? { assignedUserId: userId } : {}),
    };
    const [total, overdue, rows] = await Promise.all([
      prisma.crmFollowUp.count({ where }),
      prisma.crmFollowUp.count({ where: { ...where, dueAt: { lt: day.start } } }),
      prisma.crmFollowUp.findMany({
        where,
        orderBy: { dueAt: "asc" },
        take: 8,
        select: {
          id: true, title: true, dueAt: true, assignedUserId: true,
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        },
      }),
    ]);
    const names = await nameMap(rows.map((r) => r.assignedUserId));
    return ok({
      total,
      overdue,
      rows: rows.map((r) => ({
        id: r.id,
        leadId: r.lead.id,
        leadName: leadName(r.lead),
        company: r.lead.company,
        title: r.title,
        overdue: r.dueAt < day.start,
        dueLabel: r.dueAt < day.start ? fmtIstDate(r.dueAt) : fmtIstTime(r.dueAt),
        ownerId: r.assignedUserId,
        ownerName: r.assignedUserId ? names.get(r.assignedUserId) ?? null : null,
      })),
    });
  });
}

/* ------------------------------------------------ Leads untouched > 24h */

export interface UntouchedRow {
  id: string;
  name: string;
  company: string | null;
  source: string;
  idleFor: string;
  ownerId: string | null;
  ownerName: string | null;
}
export interface UntouchedLeads { total: number; rows: UntouchedRow[] }

export function untouchedLeads(userId: string, scope: Scope, departmentId: string): Promise<Result<UntouchedLeads>> {
  return guarded("sales.untouched", async () => {
    const ctx = await salesContext(userId, scope, departmentId);
    if (typeof ctx === "string") return denied(ctx);
    const now = Date.now();
    const cutoff = new Date(now - 24 * 3600 * 1000);
    const where: Prisma.CrmLeadWhereInput = {
      AND: [
        ctx.leadWhere,
        { status: { in: ["new", "contacted", "qualified"] }, isDuplicate: false },
        { OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, createdAt: { lt: cutoff } }] },
      ],
    };
    const [total, rows] = await Promise.all([
      prisma.crmLead.count({ where }),
      prisma.crmLead.findMany({
        where,
        orderBy: [{ createdAt: "asc" }],
        take: 8,
        select: {
          id: true, firstName: true, lastName: true, company: true, source: true,
          assignedUserId: true, lastActivityAt: true, createdAt: true,
        },
      }),
    ]);
    const names = await nameMap(rows.map((r) => r.assignedUserId));
    return ok({
      total,
      rows: rows.map((r) => ({
        id: r.id,
        name: leadName(r),
        company: r.company,
        source: r.source,
        idleFor: fmtAge((r.lastActivityAt ?? r.createdAt).getTime(), now),
        ownerId: r.assignedUserId,
        ownerName: r.assignedUserId ? names.get(r.assignedUserId) ?? null : null,
      })),
    });
  });
}

/* ------------------------------------------------- Pipeline by stage */

export interface StageRow { id: string; name: string; count: number; isWon: boolean; isLost: boolean; valueInr: number | null }
export interface PipelineByStage {
  pipelineName: string;
  stages: StageRow[];
  total: number;
  /** Deal value is revenue: only filled for Leadership. */
  showValue: boolean;
  /** Where the tile should link (Kanban is Leadership-only in the CRM). */
  href: string;
}

export function pipelineByStage(userId: string, scope: Scope, departmentId: string): Promise<Result<PipelineByStage>> {
  return guarded("sales.pipeline", async () => {
    const ctx = await salesContext(userId, scope, departmentId);
    if (typeof ctx === "string") return denied(ctx);
    const pipeline =
      (await prisma.crmPipeline.findFirst({
        where: { isDefault: true, NOT: { name: "Hiring" } },
        include: { stages: { orderBy: { sortOrder: "asc" } } },
      })) ??
      (await prisma.crmPipeline.findFirst({
        where: { NOT: { name: "Hiring" } },
        orderBy: { createdAt: "asc" },
        include: { stages: { orderBy: { sortOrder: "asc" } } },
      }));
    const href = ctx.isLeadership ? "/crm/pipeline/kanban" : "/crm/leads";
    if (!pipeline) return ok({ pipelineName: "Pipeline", stages: [], total: 0, showValue: ctx.isLeadership, href });

    const grouped = await prisma.crmLead.groupBy({
      by: ["pipelineStageId"],
      where: { AND: [ctx.leadWhere, { pipelineId: pipeline.id }] },
      _count: { _all: true },
      _sum: { dealValue: true },
    });
    const byStage = new Map(grouped.map((g) => [g.pipelineStageId, g]));
    const stages: StageRow[] = pipeline.stages.map((s) => {
      const g = byStage.get(s.id);
      return {
        id: s.id,
        name: s.name,
        count: g?._count._all ?? 0,
        isWon: s.isWon,
        isLost: s.isLost,
        valueInr: ctx.isLeadership ? g?._sum.dealValue ?? 0 : null,
      };
    });
    return ok({
      pipelineName: pipeline.name,
      stages,
      total: stages.reduce((n, s) => n + s.count, 0),
      showValue: ctx.isLeadership,
      href,
    });
  });
}

/* ------------------------------------------------- Per-rep conversion */

export interface RepRow { id: string | null; name: string; leads: number; won: number; ratePct: number }
export interface RepConversion { windowDays: number; reps: RepRow[]; totalLeads: number; totalWon: number }

export function repConversion(userId: string, scope: Scope, departmentId: string): Promise<Result<RepConversion>> {
  return guarded("sales.reps", async () => {
    const ctx = await salesContext(userId, scope, departmentId);
    if (typeof ctx === "string") return denied(ctx);
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 86400000);
    const base: Prisma.CrmLeadWhereInput = { AND: [ctx.leadWhere, { createdAt: { gte: since }, isDuplicate: false }] };
    const [all, won] = await Promise.all([
      prisma.crmLead.groupBy({ by: ["assignedUserId"], where: base, _count: { _all: true } }),
      prisma.crmLead.groupBy({ by: ["assignedUserId"], where: { AND: [base, { status: "won" }] }, _count: { _all: true } }),
    ]);
    const wonBy = new Map(won.map((w) => [w.assignedUserId, w._count._all]));
    const names = await nameMap(all.map((a) => a.assignedUserId));
    const reps: RepRow[] = all
      .map((a) => {
        const w = wonBy.get(a.assignedUserId) ?? 0;
        const n = a._count._all;
        return {
          id: a.assignedUserId,
          name: a.assignedUserId ? names.get(a.assignedUserId) ?? "Former employee" : "Unassigned",
          leads: n,
          won: w,
          ratePct: n ? Math.round((w / n) * 100) : 0,
        };
      })
      .sort((x, y) => y.leads - x.leads);
    return ok({
      windowDays,
      reps,
      totalLeads: reps.reduce((n, r) => n + r.leads, 0),
      totalWon: reps.reduce((n, r) => n + r.won, 0),
    });
  });
}

/* ------------------------------------------------- Lead source quality */

export interface SourceRow { label: string; sublabel: string | null; leads: number; qualified: number; won: number; qualifiedPct: number }
export interface SourceQuality { windowDays: number; kind: "meta" | "source"; rows: SourceRow[] }

interface RawCounts { leads: bigint; qualified: bigint; won: bigint }
interface RawMeta extends RawCounts { campaign: string | null; form: string | null }
interface RawSrc extends RawCounts { source: string }

function toSourceRow(label: string, sublabel: string | null, r: RawCounts): SourceRow {
  const leads = Number(r.leads);
  const qualified = Number(r.qualified);
  return { label, sublabel, leads, qualified, won: Number(r.won), qualifiedPct: leads ? Math.round((qualified / leads) * 100) : 0 };
}

export function sourceQuality(userId: string, scope: Scope, departmentId: string): Promise<Result<SourceQuality>> {
  return guarded("sales.sources", async () => {
    const ctx = await salesContext(userId, scope, departmentId);
    if (typeof ctx === "string") return denied(ctx);
    const windowDays = 90;
    const since = new Date(Date.now() - windowDays * 86400000);
    const scopeSql = ctx.includeUnassigned
      ? Prisma.sql`AND ("assignedUserId" IS NULL OR "assignedUserId" = ANY(${ctx.ids}::text[]))`
      : Prisma.sql`AND "assignedUserId" = ANY(${ctx.ids}::text[])`;

    // Meta leads: campaign and form live in adDetail (JSON). Import-error rows carry no ad info.
    const meta = await prisma.$queryRaw<RawMeta[]>(Prisma.sql`
      SELECT COALESCE("adDetail"->>'campaignName', "utmCampaign") AS campaign,
             "adDetail"->>'formName' AS form,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE status::text IN ('qualified','won')) AS qualified,
             COUNT(*) FILTER (WHERE status::text = 'won') AS won
      FROM "CrmLead"
      WHERE "adDetail" IS NOT NULL
        AND ("adDetail"->>'importError') IS NULL
        AND "isDuplicate" = false
        AND "createdAt" >= ${since}
        AND ("pipelineId" IS NULL OR "pipelineId" NOT IN (SELECT id FROM "CrmPipeline" WHERE name = 'Hiring'))
        ${scopeSql}
      GROUP BY 1, 2
      ORDER BY leads DESC
      LIMIT 8`);
    if (meta.length) {
      return ok({
        windowDays,
        kind: "meta" as const,
        rows: meta.map((r) => toSourceRow(r.campaign ?? "Unnamed campaign", r.form, r)),
      });
    }

    // No Meta leads in scope: fall back to the plain source column so the tile is still useful.
    const bySource = await prisma.$queryRaw<RawSrc[]>(Prisma.sql`
      SELECT source,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE status::text IN ('qualified','won')) AS qualified,
             COUNT(*) FILTER (WHERE status::text = 'won') AS won
      FROM "CrmLead"
      WHERE "isDuplicate" = false
        AND "createdAt" >= ${since}
        AND ("pipelineId" IS NULL OR "pipelineId" NOT IN (SELECT id FROM "CrmPipeline" WHERE name = 'Hiring'))
        ${scopeSql}
      GROUP BY source
      ORDER BY leads DESC
      LIMIT 8`);
    return ok({ windowDays, kind: "source" as const, rows: bySource.map((r) => toSourceRow(r.source, null, r)) });
  });
}
