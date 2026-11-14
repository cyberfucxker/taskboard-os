import { Router } from '../express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { buildLeadWhere } from '../services/leadFilters';
import type { AuthedRequest } from '../services/auth';

export const reportsRouter = Router();

/**
 * The CRM Overview's filters, read off the query string.
 *
 * Deliberately `buildLeadWhere` rather than a second set of conditions: the Overview and the
 * Leads list have to agree about what "leads from this ad form, in this window" means, and
 * two implementations of that agree right up until one of them is changed. It also brings the
 * IST day boundaries with it, which is where hand-rolled date filters in this codebase have
 * gone wrong before.
 */
/**
 * The stages behind a group id, cached for the life of one request.
 *
 * The Overview's stage filter names a GROUP, not a stage, so every figure on the page has to
 * expand the same id the same way. Expanding it here rather than in the client keeps one
 * definition of what "Disqualified" contains — a client that sent its own list would go stale
 * the moment somebody edited the group.
 */
async function stagesInGroup(groupId: string): Promise<string[]> {
  const rows = await prisma.crmStageGroupStage.findMany({ where: { groupId }, select: { stageId: true } });
  return rows.map((r) => r.stageId);
}

function overviewWhere(req: AuthedRequest, extra: Prisma.CrmLeadWhereInput = {}): Prisma.CrmLeadWhereInput {
  const q = req.query as Record<string, string>;
  const base = buildLeadWhere({
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    pipelineId: q.pipelineId,
    formName: q.formName,
    campaignName: q.campaignName,
    // `buildLeadWhere` drops an id outside the caller's own hierarchy, so this can only ever
    // narrow — asking for somebody else's numbers returns nothing rather than theirs.
    assignedUserId: q.assignedUserId,
    scope: req.scope,
  });
  return Object.keys(extra).length ? { AND: [base, extra] } : base;
}

/**
 * The page's filters plus its stage-group filter, which needs a lookup and so cannot live in
 * the synchronous builders above.
 */
async function overviewWhereAsync(
  req: AuthedRequest,
  extra: Prisma.CrmLeadWhereInput = {}
): Promise<Prisma.CrmLeadWhereInput> {
  const groupId = String((req.query as Record<string, string>).stageGroupId ?? '').trim();
  if (!groupId || groupId === 'all') return overviewWhere(req, extra);
  const stageIds = await stagesInGroup(groupId);
  // A group somebody has just deleted matches nothing rather than everything.
  return overviewWhere(req, { AND: [{ pipelineStageId: { in: stageIds } }, extra] });
}

/** The same filters minus the date window, for figures that carry their own ("New Today"). */
function overviewWhereUndated(req: AuthedRequest, extra: Prisma.CrmLeadWhereInput = {}): Prisma.CrmLeadWhereInput {
  const q = req.query as Record<string, string>;
  const base = buildLeadWhere({
    pipelineId: q.pipelineId,
    formName: q.formName,
    campaignName: q.campaignName,
    // `buildLeadWhere` drops an id outside the caller's own hierarchy, so this can only ever
    // narrow — asking for somebody else's numbers returns nothing rather than theirs.
    assignedUserId: q.assignedUserId,
    scope: req.scope,
  });
  return Object.keys(extra).length ? { AND: [base, extra] } : base;
}

/** The undated filters plus the stage-group one, for the figures that carry their own dates. */
async function overviewWhereUndatedAsync(
  req: AuthedRequest,
  extra: Prisma.CrmLeadWhereInput = {}
): Promise<Prisma.CrmLeadWhereInput> {
  const groupId = String((req.query as Record<string, string>).stageGroupId ?? '').trim();
  if (!groupId || groupId === 'all') return overviewWhereUndated(req, extra);
  const stageIds = await stagesInGroup(groupId);
  return overviewWhereUndated(req, { AND: [{ pipelineStageId: { in: stageIds } }, extra] });
}

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar day an instant falls on, as YYYY-MM-DD. */
function istDayKey(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD back to the instant that IST day starts. */
function istDayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000+05:30`);
}

/**
 * Midnight IST of the day an instant falls on.
 *
 * `setHours(0, 0, 0, 0)` was the SERVER's midnight, and production runs in UTC — so "today"
 * began at 05:30 IST and every lead that arrived overnight was counted as yesterday's. The
 * date filter has read IST all along, which is why filtering to today showed more leads than
 * "New Today" did.
 */
function startOfDay(d: Date): Date {
  return new Date(istDayStart(istDayKey(d)));
}

/** A rolling window ending now: the last n days, not the last n calendar days. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

reportsRouter.get('/dashboard-stats', async (req: AuthedRequest, res) => {
  const todayStart = startOfDay(new Date());
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);

  // "New Today" and "New This Week" carry their own window, so a date filter would fight with
  // them — they take the pipeline and ad filters and keep their own dates. Everything else is
  // filtered in full.
  const [allW, todayW, weekW, monthW, wonW, lostW, activeW] = await Promise.all([
    overviewWhereAsync(req),
    overviewWhereUndatedAsync(req, { createdAt: { gte: todayStart } }),
    overviewWhereUndatedAsync(req, { createdAt: { gte: weekStart } }),
    overviewWhereUndatedAsync(req, { createdAt: { gte: monthStart } }),
    overviewWhereAsync(req, { status: 'won' }),
    overviewWhereAsync(req, { status: 'lost' }),
    overviewWhereAsync(req, { status: { notIn: ['won', 'lost'] } }),
  ]);

  const [totalLeads, newToday, newThisWeek, newThisMonth, won, lost, activeInPipeline, wonAgg] = await Promise.all([
    prisma.crmLead.count({ where: allW }),
    prisma.crmLead.count({ where: todayW }),
    prisma.crmLead.count({ where: weekW }),
    prisma.crmLead.count({ where: monthW }),
    prisma.crmLead.count({ where: wonW }),
    prisma.crmLead.count({ where: lostW }),
    prisma.crmLead.count({ where: activeW }),
    prisma.crmLead.aggregate({ where: wonW, _sum: { wonValue: true } }),
  ]);

  const closed = won + lost;
  const conversionRate = closed > 0 ? Math.round((won / closed) * 1000) / 10 : 0;

  res.json({
    totalLeads,
    newToday,
    newThisWeek,
    newThisMonth,
    conversionRate,
    activeInPipeline,
    wonDeals: won,
    wonValue: wonAgg._sum.wonValue ?? 0,
  });
});

/** A span beyond which one point per day is too many to read, and to draw. */
const MAX_DAILY_POINTS = 92;
reportsRouter.get('/lead-trend', async (req: AuthedRequest, res) => {
  const days = Math.max(1, Number(req.query.days) || 14);
  const dated = !!(req.query.dateFrom || req.query.dateTo);
  const since = startOfDay(daysAgo(days - 1));

  const rows = await prisma.crmLead.findMany({
    where: dated ? await overviewWhereAsync(req) : await overviewWhereUndatedAsync(req, { createdAt: { gte: since } }),
    select: { createdAt: true },
  });

  // Counted by IST day, because that is the day the filter above means and the day the office
  // means. Keying by the UTC day instead puts every lead that arrived before 5:30am on the
  // day before — the off-by-one this codebase keeps rediscovering.
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = istDayKey(r.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // The buckets have to span the same window the rows were fetched for. Building them from
  // "the last N days" while the rows come from a filtered range drops every lead outside
  // those N days on the floor — the chart reads empty while the cards above it count them.
  const present = [...counts.keys()].sort();
  const todayKey = istDayKey(new Date());
  const firstKey = dated
    ? (req.query.dateFrom as string) || present[0] || todayKey
    : istDayKey(new Date(Date.now() - (days - 1) * DAY_MS));
  const lastKey = dated ? (req.query.dateTo as string) || present[present.length - 1] || todayKey : todayKey;

  const firstMs = istDayStart(firstKey);
  const span = Math.max(1, Math.round((istDayStart(lastKey) - firstMs) / DAY_MS) + 1);
  // Past three months a point per day is unreadable, so the buckets become weeks.
  const step = span > MAX_DAILY_POINTS ? 7 : 1;

  // Both the lookup and the label go back through `istDayKey`. `firstMs` is an IST midnight,
  // so reading it as UTC would name — and count — the day before.
  const points: { date: string; leads: number }[] = [];
  for (let offset = 0; offset < span; offset += step) {
    let leads = 0;
    for (let d = 0; d < step && offset + d < span; d += 1) {
      leads += counts.get(istDayKey(new Date(firstMs + (offset + d) * DAY_MS))) ?? 0;
    }
    points.push({ date: istDayKey(new Date(firstMs + offset * DAY_MS)).slice(5), leads });
  }
  res.json(points);
});

reportsRouter.get('/status-breakdown', async (req: AuthedRequest, res) => {
  const groups = await prisma.crmLead.groupBy({ by: ['status'], where: await overviewWhereAsync(req), _count: { _all: true } });
  const order = ['new', 'contacted', 'qualified', 'won', 'lost'];
  const byStatus = new Map(groups.map((g) => [g.status, g._count._all]));
  res.json(order.map((s) => ({ name: s.charAt(0).toUpperCase() + s.slice(1), value: byStatus.get(s as any) ?? 0 })));
});

reportsRouter.get('/source-performance', async (_req, res) => {
  const [totals, wonBySource] = await Promise.all([
    prisma.crmLead.groupBy({ by: ['source'], _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['source'], where: { status: 'won' }, _count: { _all: true } }),
  ]);
  const wonMap = new Map(wonBySource.map((g) => [g.source, g._count._all]));
  const rows = totals
    .map((g) => {
      const total = g._count._all;
      const won = wonMap.get(g.source) ?? 0;
      return { source: g.source, total, won, conversionRate: total > 0 ? Math.round((won / total) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.total - a.total);
  res.json(rows);
});

/**
 * The Overview's stage breakdown, read through the pipeline's stage groups when it has any.
 *
 * With groups configured the chart shows them and nothing else — a stage in no group is left
 * out, which is what the office asked for: the funnel they report on is the seven lines they
 * chose, not the ten the board happens to have. Without groups it falls back to the raw
 * stages, or a pipeline nobody has configured yet would draw an empty chart.
 */
reportsRouter.get('/stage-distribution', async (req: AuthedRequest, res, next) => {
  try {
    const pipelineId = (req.query.pipelineId as string) || undefined;
    // `none` is the Leads filter's "not on any pipeline", which has no stages to break down.
    const pipeline =
      pipelineId && pipelineId !== 'none' && pipelineId !== 'all'
        ? await prisma.crmPipeline.findUnique({ where: { id: pipelineId } })
        : pipelineId === 'none'
          ? null
          : await prisma.crmPipeline.findFirst({ where: { isDefault: true } });
    if (!pipeline) return res.json({ pipelineId: null, pipelineName: null, grouped: false, stages: [] });

    const [stages, groups] = await Promise.all([
      prisma.crmPipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { sortOrder: 'asc' } }),
      prisma.crmStageGroup.findMany({
        where: { pipelineId: pipeline.id },
        include: { stages: { select: { stageId: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const counts = await prisma.crmLead.groupBy({
      by: ['pipelineStageId'],
      // The page's own date, ad and assignee filters apply, so the breakdown describes the
      // same leads the cards above it are counting. The stage-group filter deliberately does
      // NOT: a chart narrowed to the group you already picked is one bar.
      where: overviewWhere(req, { pipelineStageId: { in: stages.map((st) => st.id) } }),
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.pipelineStageId, c._count._all]));

    if (groups.length === 0) {
      return res.json({
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        grouped: false,
        stages: stages.map((st) => ({ id: st.id, name: st.name, value: countMap.get(st.id) ?? 0, color: st.color })),
      });
    }

    const colorOf = new Map(stages.map((st) => [st.id, st.color]));
    res.json({
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      grouped: true,
      stages: groups.map((g) => ({
        id: g.id,
        name: g.name,
        value: g.stages.reduce((sum, m) => sum + (countMap.get(m.stageId) ?? 0), 0),
        // The first member's colour, so a group keeps a stable identity on the chart without
        // asking anybody to pick one.
        color: colorOf.get(g.stages[0]?.stageId ?? '') ?? '#6366f1',
      })),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/assignee-performance', async (_req, res) => {
  const [totals, won, lost] = await Promise.all([
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: { assignedUserId: { not: null } }, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: { assignedUserId: { not: null }, status: 'won' }, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: { assignedUserId: { not: null }, status: 'lost' }, _count: { _all: true } }),
  ]);
  const wonMap = new Map(won.map((g) => [g.assignedUserId, g._count._all]));
  const lostMap = new Map(lost.map((g) => [g.assignedUserId, g._count._all]));
  const rows = totals
    .map((g) => {
      const total = g._count._all;
      const w = wonMap.get(g.assignedUserId) ?? 0;
      const l = lostMap.get(g.assignedUserId) ?? 0;
      return { userId: g.assignedUserId as string, total, won: w, lost: l, conversionRate: total > 0 ? Math.round((w / total) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.total - a.total);
  res.json(rows);
});

reportsRouter.get('/followup-performance', async (_req, res) => {
  const [total, completed, missed, pending, rescheduled] = await Promise.all([
    prisma.crmFollowUp.count(),
    prisma.crmFollowUp.count({ where: { status: 'completed' } }),
    prisma.crmFollowUp.count({ where: { status: 'missed' } }),
    prisma.crmFollowUp.count({ where: { status: 'pending' } }),
    prisma.crmFollowUp.count({ where: { status: 'rescheduled' } }),
  ]);
  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
  res.json({ total, completed, missed, pending, rescheduled, completionRate });
});

reportsRouter.get('/lead-rows', async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const where: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as any).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as any).lte = new Date(dateTo);
  }
  const rows = await prisma.crmLead.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(
    rows.map((l) => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`.trim(),
      source: l.source,
      status: l.status,
      priority: l.priority,
      assignedUserId: l.assignedUserId,
      assignedTo: l.assignedTo,
      dealValue: l.dealValue ?? 0,
      createdAt: l.createdAt,
    }))
  );
});

// ---------------------------------------------------------------------------
// Report Center — a dedicated multi-report section (CRM > Report Center), distinct from
// the analytics dashboard above. Every endpoint here accepts optional `from`/`to` (ISO
// dates) and most accept a free-text `source` filter, matching the shared filter bar the
// frontend renders across all of these reports.
// ---------------------------------------------------------------------------

/** Local calendar date (YYYY-MM-DD). Never `toISOString().slice(0,10)` — see ist-timezone notes:
 * a local midnight serialises to the previous day and every "day" bucket would be off by one. */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Monday that starts `d`'s week, as a local date key — used to bucket "week" grouping. */
function localWeekKey(d: Date): string {
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return localDateKey(monday);
}

function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Reads the shared `from`/`to` query params into a Prisma date-range filter, or `{}` if neither is set. */
function parseDateRange(query: Record<string, string>): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  if (query.from) range.gte = new Date(query.from);
  if (query.to) {
    // A bare date (no time) should include the whole day, not stop at 00:00:00.
    const to = new Date(query.to);
    if (query.to.length <= 10) to.setHours(23, 59, 59, 999);
    range.lte = to;
  }
  return range;
}

reportsRouter.get('/lead-volume', async (req, res) => {
  const { source, groupBy } = req.query as Record<string, string>;
  const dateRange = parseDateRange(req.query as Record<string, string>);

  const where: Record<string, unknown> = {};
  if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;
  if (source?.trim()) {
    where.OR = [
      { source: { contains: source.trim(), mode: 'insensitive' } },
      { otherSource: { contains: source.trim(), mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.crmLead.findMany({ where, select: { createdAt: true } });
  const keyFor = groupBy === 'week' ? localWeekKey : groupBy === 'month' ? localMonthKey : localDateKey;

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(keyFor(row.createdAt), (counts.get(keyFor(row.createdAt)) ?? 0) + 1);

  const points = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));
  res.json({ total: rows.length, points });
});

reportsRouter.get('/source-performance-report', async (req, res) => {
  const { source } = req.query as Record<string, string>;
  const dateRange = parseDateRange(req.query as Record<string, string>);
  const where: Record<string, unknown> = {};
  if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;
  if (source?.trim()) where.source = { contains: source.trim(), mode: 'insensitive' };

  const [totals, won, lost, wonValueAgg] = await Promise.all([
    prisma.crmLead.groupBy({ by: ['source'], where, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['source'], where: { ...where, status: 'won' }, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['source'], where: { ...where, status: 'lost' }, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['source'], where: { ...where, status: 'won' }, _sum: { wonValue: true } }),
  ]);
  const wonMap = new Map(won.map((g) => [g.source, g._count._all]));
  const lostMap = new Map(lost.map((g) => [g.source, g._count._all]));
  const valueMap = new Map(wonValueAgg.map((g) => [g.source, g._sum.wonValue ?? 0]));

  const rows = totals
    .map((g) => {
      const total = g._count._all;
      const wonCount = wonMap.get(g.source) ?? 0;
      return {
        source: g.source,
        total,
        won: wonCount,
        lost: lostMap.get(g.source) ?? 0,
        conversionRate: total > 0 ? Math.round((wonCount / total) * 1000) / 10 : 0,
        wonValue: valueMap.get(g.source) ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);
  res.json(rows);
});

reportsRouter.get('/source-attribution', async (req, res) => {
  const dateRange = parseDateRange(req.query as Record<string, string>);
  const where: Record<string, unknown> = {};
  if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;

  const rows = await prisma.crmLead.findMany({ where, select: { utmSource: true, utmMedium: true, utmCampaign: true, source: true } });

  const bySourceMap = new Map<string, number>();
  const byCampaignMap = new Map<string, number>();
  for (const row of rows) {
    // Falls back to the plain `source` for leads with no UTM tagging (e.g. manually created).
    const utmKey = row.utmSource?.trim() || row.source;
    bySourceMap.set(utmKey, (bySourceMap.get(utmKey) ?? 0) + 1);
    if (row.utmCampaign?.trim()) {
      const label = row.utmMedium?.trim() ? `${row.utmCampaign} (${row.utmMedium})` : row.utmCampaign;
      byCampaignMap.set(label, (byCampaignMap.get(label) ?? 0) + 1);
    }
  }

  res.json({
    total: rows.length,
    bySource: [...bySourceMap.entries()].map(([utmSource, total]) => ({ utmSource, total })).sort((a, b) => b.total - a.total),
    byCampaign: [...byCampaignMap.entries()]
      .map(([campaign, total]) => ({ campaign, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15),
  });
});

reportsRouter.get('/pipeline-funnel', async (req, res) => {
  const { pipelineId } = req.query as Record<string, string>;
  const dateRange = parseDateRange(req.query as Record<string, string>);

  const pipeline = pipelineId
    ? await prisma.crmPipeline.findUnique({ where: { id: pipelineId } })
    : await prisma.crmPipeline.findFirst({ where: { isDefault: true } });
  if (!pipeline) return res.json({ pipelineId: null, stages: [] });

  const stages = await prisma.crmPipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { sortOrder: 'asc' } });
  const where: Record<string, unknown> = { pipelineStageId: { in: stages.map((s) => s.id) } };
  if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;

  const counts = await prisma.crmLead.groupBy({ by: ['pipelineStageId'], where, _count: { _all: true } });
  const countMap = new Map(counts.map((c) => [c.pipelineStageId, c._count._all]));

  /**
   * "Reached stage N" = currently at stage N or any later stage — the closest funnel view
   * available without a per-stage entry/exit history table (only the *current* stage is
   * tracked on Lead; LeadStageHistoryEntry logs moves but not a clean "time in stage N" span
   * for leads still mid-pipeline). Directionally correct for a forward-moving pipeline.
   */
  const rawCounts = stages.map((s) => countMap.get(s.id) ?? 0);
  const reached = rawCounts.map((_, i) => rawCounts.slice(i).reduce((sum, c) => sum + c, 0));

  const result = stages.map((stage, i) => ({
    stageId: stage.id,
    stage: stage.name,
    color: stage.color,
    count: rawCounts[i],
    reached: reached[i],
    conversionFromPrevious: i === 0 ? 100 : reached[i - 1] > 0 ? Math.round((reached[i] / reached[i - 1]) * 1000) / 10 : 0,
  }));

  res.json({ pipelineId: pipeline.id, pipelineName: pipeline.name, stages: result });
});

reportsRouter.get('/pipeline-bottlenecks', async (req, res) => {
  const { pipelineId } = req.query as Record<string, string>;
  const pipeline = pipelineId
    ? await prisma.crmPipeline.findUnique({ where: { id: pipelineId } })
    : await prisma.crmPipeline.findFirst({ where: { isDefault: true } });
  if (!pipeline) return res.json({ pipelineId: null, stages: [] });

  const stages = await prisma.crmPipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { sortOrder: 'asc' } });
  const leads = await prisma.crmLead.findMany({
    where: { pipelineStageId: { in: stages.map((s) => s.id) } },
    select: { pipelineStageId: true, stageEnteredAt: true, createdAt: true },
  });

  const now = Date.now();
  const byStage = new Map<string, number[]>();
  for (const lead of leads) {
    const enteredAt = (lead.stageEnteredAt ?? lead.createdAt).getTime();
    const days = (now - enteredAt) / 86_400_000;
    const bucket = byStage.get(lead.pipelineStageId as string);
    if (bucket) bucket.push(days);
    else byStage.set(lead.pipelineStageId as string, [days]);
  }

  const result = stages
    .map((stage) => {
      const days = byStage.get(stage.id) ?? [];
      const avgDays = days.length > 0 ? days.reduce((sum, d) => sum + d, 0) / days.length : 0;
      return { stageId: stage.id, stage: stage.name, color: stage.color, leadsInStage: days.length, avgDaysInStage: Math.round(avgDays * 10) / 10 };
    })
    .sort((a, b) => b.avgDaysInStage - a.avgDaysInStage);

  res.json({ pipelineId: pipeline.id, pipelineName: pipeline.name, stages: result });
});

reportsRouter.get('/agent-performance-report', async (req, res) => {
  const dateRange = parseDateRange(req.query as Record<string, string>);
  const base: Record<string, unknown> = { assignedUserId: { not: null } };
  if (Object.keys(dateRange).length > 0) base.createdAt = dateRange;

  const [totals, won, lost, wonValueAgg] = await Promise.all([
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: base, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: { ...base, status: 'won' }, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: { ...base, status: 'lost' }, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where: { ...base, status: 'won' }, _sum: { wonValue: true } }),
  ]);
  const wonMap = new Map(won.map((g) => [g.assignedUserId, g._count._all]));
  const lostMap = new Map(lost.map((g) => [g.assignedUserId, g._count._all]));
  const valueMap = new Map(wonValueAgg.map((g) => [g.assignedUserId, g._sum.wonValue ?? 0]));

  const rows = totals
    .map((g) => {
      const total = g._count._all;
      const w = wonMap.get(g.assignedUserId) ?? 0;
      return {
        userId: g.assignedUserId as string,
        total,
        won: w,
        lost: lostMap.get(g.assignedUserId) ?? 0,
        conversionRate: total > 0 ? Math.round((w / total) * 1000) / 10 : 0,
        wonValue: valueMap.get(g.assignedUserId) ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);
  res.json(rows);
});

/**
 * The leads behind one agent's row, for the drill-down on the report.
 *
 * Deliberately uses the same `parseDateRange` and the same `assignedUserId` test as the row
 * above it: a drawer that opens off a figure and then disagrees with it is worse than no
 * drawer at all.
 */
reportsRouter.get('/agent-performance-report/:userId/leads', async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const dateRange = parseDateRange(req.query as Record<string, string>);

    const where: Prisma.CrmLeadWhereInput = { assignedUserId: userId };
    if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;

    const [leads, byStatus] = await Promise.all([
      prisma.crmLead.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          priority: true,
          source: true,
          dealValue: true,
          wonValue: true,
          createdAt: true,
          stage: { select: { name: true } },
          pipeline: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.crmLead.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    res.json({
      total: leads.length,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      leads: leads.map((l) => ({
        id: l.id,
        name: `${l.firstName} ${l.lastName}`.trim(),
        phone: l.phone,
        status: l.status,
        priority: l.priority,
        source: l.source,
        stageName: l.stage?.name ?? null,
        pipelineName: l.pipeline?.name ?? null,
        dealValue: l.dealValue ?? null,
        wonValue: l.wonValue ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/revenue-by-rep', async (req, res) => {
  const dateRange = parseDateRange(req.query as Record<string, string>);
  // Revenue is dated by when the deal closed, not when the lead first came in.
  const where: Record<string, unknown> = { status: 'won' };
  if (Object.keys(dateRange).length > 0) where.wonAt = dateRange;

  const [totals, valueAgg] = await Promise.all([
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where, _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ['assignedUserId'], where, _sum: { wonValue: true } }),
  ]);
  const valueMap = new Map(valueAgg.map((g) => [g.assignedUserId, g._sum.wonValue ?? 0]));

  const rows = totals
    .map((g) => ({
      userId: (g.assignedUserId as string) ?? null,
      deals: g._count._all,
      revenue: valueMap.get(g.assignedUserId) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  res.json(rows);
});

reportsRouter.get('/automation-stats', async (req, res) => {
  const dateRange = parseDateRange(req.query as Record<string, string>);
  const where: Record<string, unknown> = {};
  if (Object.keys(dateRange).length > 0) where.ranAt = dateRange;

  const runs = await prisma.crmAutomationRun.findMany({ where, select: { automationId: true, automationName: true, status: true } });
  const byAutomation = new Map<string, { name: string; success: number; failed: number; skipped: number }>();
  for (const run of runs) {
    const entry = byAutomation.get(run.automationId) ?? { name: run.automationName, success: 0, failed: 0, skipped: 0 };
    if (run.status === 'success') entry.success += 1;
    else if (run.status === 'failed') entry.failed += 1;
    else entry.skipped += 1;
    byAutomation.set(run.automationId, entry);
  }

  const rows = [...byAutomation.entries()]
    .map(([automationId, e]) => ({
      automationId,
      name: e.name,
      total: e.success + e.failed + e.skipped,
      success: e.success,
      failed: e.failed,
      skipped: e.skipped,
      successRate: e.success + e.failed > 0 ? Math.round((e.success / (e.success + e.failed)) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
  res.json(rows);
});

reportsRouter.get('/response-time', async (req, res) => {
  const { source } = req.query as Record<string, string>;
  const dateRange = parseDateRange(req.query as Record<string, string>);
  const where: Record<string, unknown> = {};
  if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;
  if (source?.trim()) where.source = { contains: source.trim(), mode: 'insensitive' };

  const leads = await prisma.crmLead.findMany({ where, select: { source: true, createdAt: true, contactedAt: true } });
  const contacted = leads.filter((l) => l.contactedAt);
  const minutesFor = (l: (typeof contacted)[number]) => (l.contactedAt!.getTime() - l.createdAt.getTime()) / 60_000;

  const bySourceMinutes = new Map<string, number[]>();
  for (const lead of contacted) {
    const bucket = bySourceMinutes.get(lead.source);
    const minutes = minutesFor(lead);
    if (bucket) bucket.push(minutes);
    else bySourceMinutes.set(lead.source, [minutes]);
  }

  const avg = (values: number[]) => (values.length > 0 ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : 0);

  res.json({
    totalLeads: leads.length,
    contactedCount: contacted.length,
    notContactedCount: leads.length - contacted.length,
    avgResponseMinutes: avg(contacted.map(minutesFor)),
    bySource: [...bySourceMinutes.entries()]
      .map(([src, values]) => ({ source: src, count: values.length, avgResponseMinutes: avg(values) }))
      .sort((a, b) => a.avgResponseMinutes - b.avgResponseMinutes),
  });
});

reportsRouter.get('/form-analytics-summary', async (req, res) => {
  const dateRange = parseDateRange(req.query as Record<string, string>);
  const submissionWhere: Record<string, unknown> = Object.keys(dateRange).length > 0 ? { createdAt: dateRange } : {};

  const forms = await prisma.crmForm.findMany({
    include: {
      _count: { select: { submissions: true } },
      submissions: { where: submissionWhere, select: { leadId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = forms.map((form) => ({
    id: form.id,
    name: form.name,
    slug: form.slug,
    isActive: form.isActive,
    allTimeSubmissions: form._count.submissions,
    submissionsInRange: form.submissions.length,
    leadsInRange: form.submissions.filter((s) => s.leadId).length,
  }));

  res.json({
    totalForms: forms.length,
    activeForms: forms.filter((f) => f.isActive).length,
    totalSubmissionsInRange: rows.reduce((sum, r) => sum + r.submissionsInRange, 0),
    totalLeadsInRange: rows.reduce((sum, r) => sum + r.leadsInRange, 0),
    forms: rows.sort((a, b) => b.submissionsInRange - a.submissionsInRange),
  });
});
