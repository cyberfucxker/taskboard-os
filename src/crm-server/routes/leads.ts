import { Router } from '../express';
import { prisma } from '../prisma';
import { buildLeadWhere } from '../services/leadFilters';
import { actingUser, type AuthedRequest } from '../services/auth';
import { canAssignTo, ownerScope } from '../services/hierarchy';
import { Prisma } from '@prisma/client';
import { fireTrigger } from '../services/automationEngine';
import { emailNormalized, phoneKeys } from '@/lib/leads/normalize';

export const leadsRouter = Router();

/** Pipeline IDs the given user cannot access due to allowedUserIds restrictions. */
async function forbiddenPipelineIds(req: AuthedRequest): Promise<string[]> {
  const role = req.auth?.role ?? '';
  if (role === 'SUPER_ADMIN' || role === 'DEPARTMENT_HEAD') return []; // bypass
  const userId = req.auth?.sub ?? '';
  const restricted = await prisma.crmPipeline.findMany({

    select: { id: true, allowedUserIds: true },
  });
  return restricted
    .filter(p => {
      const ids = Array.isArray(p.allowedUserIds) ? (p.allowedUserIds as string[]) : [];
      return ids.length > 0 && !ids.includes(userId);
    })
    .map(p => p.id);
}

function leadFullName(l: { firstName: string; lastName: string }) {
  return `${l.firstName} ${l.lastName}`.trim();
}


/**
 * The lead, if this person is allowed to see it. A lead outside their hierarchy is reported as
 * missing rather than forbidden: "not yours" and "does not exist" should look the same from
 * outside, or the id space itself becomes a way to enumerate other teams' leads.
 */
async function visibleLead(req: AuthedRequest, id: string) {
  const scope = req.scope;
  return prisma.crmLead.findFirst({ where: { id, ...ownerScope(scope) }, select: { id: true } });
}

/** The ids from a bulk request this person may actually act on. */
async function visibleLeadIds(req: AuthedRequest, ids: unknown): Promise<string[]> {
  const wanted = Array.isArray(ids) ? ids.map(String) : [];
  if (wanted.length === 0) return [];
  const scope = req.scope;
  if (!scope || scope.isAll) return wanted;
  const rows = await prisma.crmLead.findMany({
    where: { id: { in: wanted }, ...ownerScope(scope) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * What each sortable column orders by.
 *
 * Every key the Leads table marks sortable has to appear here. Two of them used to be missing
 * — the header showed an arrow, the click did nothing, and the list quietly came back ordered
 * by createdAt, which looks exactly like a sort that does not work.
 *
 * `nulls: 'last'` on the date and money columns: Postgres puts NULLs first on DESC, so
 * without it "newest follow-up first" opens with every lead that has no follow-up at all.
 */
function leadOrderBy(
  sortBy: string | undefined,
  sortDir: string | undefined
): Prisma.CrmLeadOrderByWithRelationInput | Prisma.CrmLeadOrderByWithRelationInput[] {
  const dir: Prisma.SortOrder = sortDir === 'asc' ? 'asc' : 'desc';
  const nullsLast = { sort: dir, nulls: 'last' } as const;

  switch (sortBy) {
    // A person's name is two columns, so it is two sort keys — otherwise every Brooks lands
    // in arrival order inside the S block.
    case 'name':
      return [{ firstName: dir }, { lastName: dir }];
    case 'source':
      return { source: dir };
    // Both enums are declared in a meaningful order (new -> lost, low -> urgent), and
    // Postgres sorts an enum by its declaration order, so this reads as progress rather
    // than as alphabetical noise.
    case 'status':
      return { status: dir };
    case 'priority':
      return { priority: dir };
    // Pipeline first, then the stage's own position inside it. `sortOrder` restarts at 1 in
    // every pipeline, so on its own it would interleave "New Lead" from one pipeline with
    // "Inquiry" from another. With the list filtered to a single pipeline — which is how it
    // is usually read — the first key collapses and this is just stage order.
    case 'stage':
      return [{ pipeline: { name: dir } }, { stage: { sortOrder: dir } }];
    case 'leadScore':
      return { leadScore: dir };
    case 'dealValue':
      return { dealValue: nullsLast };
    case 'nextFollowUpAt':
      return { nextFollowUpAt: nullsLast };
    // Denormalised onto the lead by a trigger, because Prisma cannot order a to-many
    // relation by max(createdAt). See the schema note.
    case 'lastActivity':
      return { lastActivityAt: nullsLast };
    default:
      return { createdAt: dir };
  }
}

leadsRouter.get('/', async (req, res) => {
  const {
    page = '1',
    pageSize = '10',
    search,
    status,
    priority,
    source,
    pipelineId,
    stageId,
    assignedUserId,
    campaignName,
    adName,
    formName,
    dateFrom,
    dateTo,
    lastActivityFrom,
    lastActivityTo,
    sortBy,
    sortDir,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number(page) || 1);
  // Capped at what the rows-per-page picker offers: a hand-edited URL asking for ten thousand
  // leads would build the whole list in memory and pre-join every one of them.
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10));

  const forbidden = await forbiddenPipelineIds(req as AuthedRequest);
  const where = buildLeadWhere({
    search, status, priority, source, pipelineId, stageId, assignedUserId,
    campaignName, adName, formName, dateFrom, dateTo, lastActivityFrom, lastActivityTo,
    scope: (req as AuthedRequest).scope,
    forbiddenPipelineIds: forbidden,
  });

  const orderBy = leadOrderBy(sortBy, sortDir);

  const [items, total] = await Promise.all([
    prisma.crmLead.findMany({
      where,
      orderBy,
      skip: (pageNum - 1) * size,
      take: size,
      include: {
        tags: { include: { tag: true } },
        stage: true,
        pipeline: true,
        // Just the newest one: the list shows when a lead was last touched, not its history.
        activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { type: true, description: true, createdAt: true } },
      },
    }),
    prisma.crmLead.count({ where }),
  ]);

  res.json({
    items: items.map(({ activities, ...l }) => ({
      ...l,
      tagIds: l.tags.map((t) => t.tagId),
      lastActivity: activities[0]
        ? { type: activities[0].type, description: activities[0].description, at: activities[0].createdAt.toISOString() }
        : null,
    })),
    total,
    page: pageNum,
    pageSize: size,
  });
});

/**
 * Every lead id the current filter matches, for "select all" on the list.
 *
 * Ids only, and capped: the page needs them to run a bulk action, not to render anything, and
 * a filter that matches the whole database should not ship the whole database to do it.
 */
/**
 * The campaigns and ads that have actually produced leads, for the filter dropdowns.
 *
 * Read from the leads rather than from Meta: the point is to filter what is in front of you,
 * and an ad that has never produced a lead is only noise in a list.
 */
leadsRouter.get('/ad-sources', async (_req, res, next) => {
  try {
    const campaigns = await prisma.crmLead.groupBy({
      by: ['utmCampaign'],
      where: { utmCampaign: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { utmCampaign: 'desc' } },
      take: 100,
    });

    // adDetail is JSON, so the ad names are counted in memory. Bounded by the Meta leads that
    // have one, which is only those ingested since the column existed.
    const withAd = await prisma.crmLead.findMany({
      where: { adDetail: { not: Prisma.DbNull } },
      select: { adDetail: true },
      take: 5000,
    });
    const adCounts = new Map<string, number>();
    const formCounts = new Map<string, number>();
    for (const row of withAd) {
      const detail = row.adDetail as { adName?: string; formName?: string } | null;
      if (detail?.adName) adCounts.set(detail.adName, (adCounts.get(detail.adName) ?? 0) + 1);
      if (detail?.formName) formCounts.set(detail.formName, (formCounts.get(detail.formName) ?? 0) + 1);
    }
    const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;

    res.json({
      campaigns: campaigns
        .filter((c) => c.utmCampaign)
        .map((c) => ({ name: c.utmCampaign as string, count: c._count._all })),
      ads: Array.from(adCounts.entries()).map(([name, count]) => ({ name, count })).sort(byCount),
      forms: Array.from(formCounts.entries()).map(([name, count]) => ({ name, count })).sort(byCount),
    });
  } catch (err) {
    next(err);
  }
});

leadsRouter.get('/ids', async (req, res, next) => {
  try {
    const {
      search, status, priority, source, pipelineId, stageId, assignedUserId,
      campaignName, adName, formName, dateFrom, dateTo, lastActivityFrom, lastActivityTo,
    } =
      req.query as Record<string, string>;
    const where = buildLeadWhere({
      search, status, priority, source, pipelineId, stageId, assignedUserId,
      campaignName, adName, formName, dateFrom, dateTo, lastActivityFrom, lastActivityTo,
      scope: (req as AuthedRequest).scope,
    });

    const LIMIT = 5000;
    const [rows, total] = await Promise.all([
      prisma.crmLead.findMany({ where, select: { id: true }, orderBy: { createdAt: 'desc' }, take: LIMIT }),
      prisma.crmLead.count({ where }),
    ]);

    res.json({ ids: rows.map((r) => r.id), total, capped: total > LIMIT, limit: LIMIT });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/', async (req: AuthedRequest, res) => {
  const body = req.body;
  // The legacy CRM checked this on the assign endpoints but not on create, so a lead could be created
  // straight into someone else's hands outside the creator's scope.
  if (body.assignedUserId && !canAssignTo(req.scope, String(body.assignedUserId))) {
    return res.status(403).json({ error: 'You can only assign leads to yourself or to someone in your own team.' });
  }
  const created = await prisma.crmLead.create({
    data: {
      firstName: body.firstName ?? '',
      lastName: body.lastName ?? '',
      email: body.email || undefined,
      phone: body.phone ?? '',
      city: body.city || undefined,
      company: body.company || undefined,
      jobTitle: body.jobTitle || undefined,
      website: body.website || undefined,
      industry: body.industry || undefined,
      requirement: body.requirement || undefined,
      serviceInterest: body.serviceInterest || undefined,
      budgetRange: body.budgetRange || undefined,
      services: Array.isArray(body.services) ? body.services.filter(Boolean) : [],
      source: body.source ?? 'manual',
      priority: body.priority ?? 'normal',
      assignedUserId: body.assignedUserId || undefined,
      pipelineId: body.pipelineId || undefined,
      pipelineStageId: body.pipelineStageId || undefined,
      stageEnteredAt: body.pipelineStageId ? new Date() : undefined,
      dealValue: body.dealValue ?? undefined,
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
      notes: body.notes || undefined,
    },
  });
  await prisma.crmActivity.create({
    data: { leadId: created.id, type: 'created', description: `Lead "${leadFullName(created)}" created.` },
  });
  await fireTrigger('lead_created', created.id);
  res.status(201).json(created);
});

// ---------------------------------------------------------------------------
// Bulk actions and CSV import — registered BEFORE the `/:id/...` routes below,
// since a path like `/bulk/assign` would otherwise be shadowed by `/:id/assign`
// (Express matches routes in registration order, and both shapes are `/segment/segment`).
// ---------------------------------------------------------------------------

/**
 * Bulk assign, or bulk UNASSIGN when `userId` is null — the same shape `POST /:id/assign`
 * already uses, so one endpoint covers both and the two cannot drift apart.
 *
 * Unassigning is allowed for anybody who can see the lead, including a team leader, because
 * handing a lead back to the pool is ordinary work. It is worth knowing what it costs them:
 * `ownerScope` hides unassigned leads from everyone but a full-access admin, so a team leader
 * who unassigns loses sight of that lead immediately and cannot take it back themselves. The
 * UI warns about this; the server does not forbid it.
 */
leadsRouter.post('/bulk/assign', async (req: AuthedRequest, res) => {
  const { ids, userId } = req.body as { ids: string[]; userId: string | null };
  // '' and undefined both arrive from a <select>; all three mean "nobody".
  const target = userId || null;

  if (target && !canAssignTo(req.scope, target)) {
    return res.status(403).json({ error: 'You can only assign leads to yourself or to someone in your own team.' });
  }
  const allowed = await visibleLeadIds(req, ids);
  const actor = await actingUser(req);
  const leads = await prisma.crmLead.findMany({ where: { id: { in: allowed } }, select: { id: true, assignedUserId: true } });
  await Promise.all(
    leads.map(async (lead) => {
      await prisma.crmLead.update({ where: { id: lead.id }, data: { assignedUserId: target } });
      await prisma.crmAssignmentHistoryEntry.create({
        data: { leadId: lead.id, fromUserId: lead.assignedUserId, toUserId: target, actorName: actor.name },
      });
      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'assigned', description: target ? 'Bulk-assigned.' : 'Bulk-unassigned.', userName: actor.name },
      });
      // Nobody was assigned, so nothing that reacts to an assignment should run.
      if (target) await fireTrigger('lead_assigned', lead.id);
    })
  );
  res.status(204).send();
});

/**
 * Several changes to several leads in ONE request.
 *
 * The one-button-one-call endpoints below still exist and still work; this is what the Leads
 * screen now uses, because "move these to Proposal Sent and give them to Gaurav" was two
 * trips through the selection — and the selection was cleared between them.
 *
 * A key that is absent is left alone. That is the whole contract, and it is why
 * `assignedUserId: null` (unassign) has to be told apart from the key never being sent.
 *
 * Everything is checked BEFORE anything is written. A half-applied batch — stage moved, assign
 * refused — is worse than a batch that did nothing, because nobody can tell by looking which
 * half landed.
 */
leadsRouter.post('/bulk/edit', async (req: AuthedRequest, res) => {
  const { ids, changes } = req.body as { ids: string[]; changes: Record<string, unknown> };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No leads were selected.' });
  if (!changes || Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nothing to change.' });

  const has = (key: string) => Object.prototype.hasOwnProperty.call(changes, key);
  const str = (key: string) => (typeof changes[key] === 'string' ? (changes[key] as string) : undefined);

  const assigning = has('assignedUserId');
  const assignTo = assigning ? (str('assignedUserId') || null) : undefined;
  if (assignTo && !canAssignTo(req.scope, assignTo)) {
    return res.status(403).json({ error: 'You can only assign leads to yourself or to someone in your own team.' });
  }

  const stageId = str('stageId');
  const pipelineId = str('pipelineId');
  let toStage: Awaited<ReturnType<typeof prisma.crmPipelineStage.findUnique>> = null;
  if (stageId) {
    toStage = await prisma.crmPipelineStage.findUnique({ where: { id: stageId } });
    if (!toStage) return res.status(400).json({ error: 'That stage no longer exists.' });
    // A stage from one pipeline written against another leaves the lead somewhere the board
    // cannot draw it.
    if (pipelineId && toStage.pipelineId !== pipelineId) {
      return res.status(400).json({ error: 'That stage belongs to a different pipeline.' });
    }
  }

  const addTagId = str('addTagId');
  const removeTagId = str('removeTagId');

  const allowed = await visibleLeadIds(req, ids);
  const actor = await actingUser(req);
  const leads = await prisma.crmLead.findMany({ where: { id: { in: allowed } }, include: { stage: true } });

  for (const lead of leads) {
    // Field order does not matter to the database, but it does to the reader: source, status
    // and priority are plain columns; stage brings its own side effects.
    const data: Record<string, unknown> = {};
    if (has('source')) {
      data.source = str('source');
      data.otherSource = str('source') === 'other' ? str('otherSource') || undefined : null;
    }
    if (has('status')) data.status = str('status');
    if (has('priority')) data.priority = str('priority');
    if (toStage) {
      data.pipelineId = toStage.pipelineId;
      data.pipelineStageId = toStage.id;
      data.stageEnteredAt = new Date();
      // Deliberately after the explicit status above: a won/lost stage IS the lead's status,
      // and leaving "New" on a lead sitting in Won would contradict the board.
      if (toStage.isWon) data.status = 'won';
      if (toStage.isLost) data.status = 'lost';
    }
    if (Object.keys(data).length > 0) {
      await prisma.crmLead.update({ where: { id: lead.id }, data: data as never });
    }

    if (toStage && toStage.id !== lead.pipelineStageId) {
      await prisma.crmStageHistoryEntry.create({
        data: { leadId: lead.id, fromStageName: lead.stage?.name, toStageName: toStage.name, actorName: actor.name },
      });
      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'stage_moved', description: `Bulk-moved to "${toStage.name}".`, userName: actor.name },
      });
    }

    if (addTagId) await prisma.crmTagOnLead.create({ data: { leadId: lead.id, tagId: addTagId } }).catch(() => undefined);
    if (removeTagId) await prisma.crmTagOnLead.deleteMany({ where: { leadId: lead.id, tagId: removeTagId } });

    // Assignment last, which is the order people describe the job in: get them onto the right
    // stage, THEN hand them to somebody.
    if (assigning && assignTo !== lead.assignedUserId) {
      await prisma.crmLead.update({ where: { id: lead.id }, data: { assignedUserId: assignTo ?? null } });
      await prisma.crmAssignmentHistoryEntry.create({
        data: { leadId: lead.id, fromUserId: lead.assignedUserId, toUserId: assignTo ?? null, actorName: actor.name },
      });
      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'assigned', description: assignTo ? 'Bulk-assigned.' : 'Bulk-unassigned.', userName: actor.name },
      });
    }

    // Triggers only once every field has landed, so an automation reads the lead as it now is
    // rather than half-way through the edit.
    if (toStage && toStage.id !== lead.pipelineStageId) {
      await fireTrigger('lead_stage_changed', lead.id, { fromStageId: lead.pipelineStageId ?? undefined, toStageId: toStage.id });
    }
    if (assigning && assignTo && assignTo !== lead.assignedUserId) {
      await fireTrigger('lead_assigned', lead.id);
    }
  }

  res.json({ updated: leads.length, skipped: ids.length - leads.length });
});

leadsRouter.post('/bulk/status', async (req: AuthedRequest, res) => {
  const { ids, status } = req.body as { ids: string[]; status: string };
  const allowed = await visibleLeadIds(req, ids);
  await prisma.crmLead.updateMany({ where: { id: { in: allowed } }, data: { status: status as any } });
  res.status(204).send();
});

leadsRouter.post('/bulk/priority', async (req: AuthedRequest, res) => {
  const { ids, priority } = req.body as { ids: string[]; priority: string };
  const allowed = await visibleLeadIds(req, ids);
  await prisma.crmLead.updateMany({ where: { id: { in: allowed } }, data: { priority: priority as any } });
  res.status(204).send();
});

leadsRouter.post('/bulk/source', async (req: AuthedRequest, res) => {
  const { ids, source, otherSource } = req.body as { ids: string[]; source: string; otherSource?: string };
  const allowed = await visibleLeadIds(req, ids);
  await prisma.crmLead.updateMany({
    where: { id: { in: allowed } },
    data: { source, otherSource: source === 'other' ? otherSource || undefined : null },
  });
  res.status(204).send();
});

leadsRouter.post('/bulk/tag', async (req: AuthedRequest, res) => {
  const { ids, tagId } = req.body as { ids: string[]; tagId: string };
  const allowed = await visibleLeadIds(req, ids);
  await Promise.all(
    allowed.map((leadId) => prisma.crmTagOnLead.create({ data: { leadId, tagId } }).catch(() => undefined))
  );
  res.status(204).send();
});

leadsRouter.post('/bulk/untag', async (req: AuthedRequest, res) => {
  const { ids, tagId } = req.body as { ids: string[]; tagId: string };
  const allowed = await visibleLeadIds(req, ids);
  await prisma.crmTagOnLead.deleteMany({ where: { leadId: { in: allowed }, tagId } });
  res.status(204).send();
});

leadsRouter.post('/bulk/stage', async (req: AuthedRequest, res) => {
  const { ids, pipelineId, stageId } = req.body as { ids: string[]; pipelineId: string; stageId: string };
  const allowed = await visibleLeadIds(req, ids);
  const toStage = await prisma.crmPipelineStage.findUnique({ where: { id: stageId } });
  const actor = await actingUser(req);
  const leads = await prisma.crmLead.findMany({ where: { id: { in: allowed } }, include: { stage: true } });

  const data: Record<string, unknown> = { pipelineId, pipelineStageId: stageId, stageEnteredAt: new Date() };
  if (toStage?.isWon) data.status = 'won';
  if (toStage?.isLost) data.status = 'lost';

  await Promise.all(
    leads.map(async (lead) => {
      await prisma.crmLead.update({ where: { id: lead.id }, data: data as any });
      await prisma.crmStageHistoryEntry.create({
        data: { leadId: lead.id, fromStageName: lead.stage?.name, toStageName: toStage?.name ?? 'Unknown', actorName: actor.name },
      });
      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'stage_moved', description: `Bulk-moved to "${toStage?.name ?? 'Unknown'}".`, userName: actor.name },
      });
      await fireTrigger('lead_stage_changed', lead.id, { fromStageId: lead.pipelineStageId ?? undefined, toStageId: stageId });
    })
  );
  res.status(204).send();
});

leadsRouter.post('/bulk/delete', async (req: AuthedRequest, res) => {
  const { ids } = req.body as { ids: string[] };
  const allowed = await visibleLeadIds(req, ids);
  await prisma.crmLead.deleteMany({ where: { id: { in: allowed } } });
  res.status(204).send();
});

/**
 * CSV Import — header-mapped rows in, dedupe by email/phone, same net effect as the
 * frontend's previous mock importer (the header-mapping UI lives with the CRM screens). Dedupe
 * uses the same normalised email / phone keys as TaskBoard's TeleCRM and CSV importers.
 */
leadsRouter.post('/import', async (req, res) => {
  const { rows, defaultPipelineId, defaultStageId } = req.body as {
    rows: Record<string, string>[];
    defaultPipelineId?: string;
    defaultStageId?: string;
  };

  const seen = new Set<string>();
  const results: { row: number; status: 'imported' | 'duplicate' | 'skipped'; reason?: string; leadId?: string }[] = [];
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = emailNormalized(row.email) ?? undefined;
    const phone = row.phone?.trim() || '';
    // Every form the number could be stored under (+91 / 0 / bare), exactly as TaskBoard's TeleCRM
    // and CSV importers match — the legacy CRM compared the raw digits against the raw phone column,
    // which missed "+91 98..." against "98...".
    const phoneForms = phoneKeys(phone);
    const phoneNormalized = phoneForms[0] ?? '';

    if (!phone && !email) {
      results.push({ row: i + 1, status: 'skipped', reason: 'No email or phone provided.' });
      skipped += 1;
      continue;
    }

    const dedupeKeys = [email ? `e:${email}` : null, phoneNormalized ? `p:${phoneNormalized}` : null].filter(
      (k): k is string => !!k
    );
    const alreadySeen = dedupeKeys.some((k) => seen.has(k));
    const existsInDb =
      email || phoneNormalized
        ? await prisma.crmLead.findFirst({
            where: {
              OR: [
                ...(email ? [{ emailNormalized: email }] : []),
                ...(phoneForms.length ? [{ phoneNormalized: { in: phoneForms } }] : []),
              ],
            },
          })
        : null;

    if (alreadySeen || existsInDb) {
      results.push({ row: i + 1, status: 'duplicate', reason: 'Matches an existing lead by email or phone.' });
      duplicates += 1;
      continue;
    }
    dedupeKeys.forEach((k) => seen.add(k));

    let firstName: string | undefined = row.first_name?.trim();
    let lastName: string | undefined = row.last_name?.trim();
    if (!firstName && !lastName && row.full_name) {
      const parts = row.full_name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || undefined;
    }

    const created = await prisma.crmLead.create({
      data: {
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        email,
        phone,
        city: row.city?.trim() || undefined,
        company: row.company?.trim() || undefined,
        source: 'manual',
        otherSource: row.source?.trim() || undefined,
        pipelineId: defaultPipelineId || undefined,
        pipelineStageId: defaultStageId || undefined,
        stageEnteredAt: defaultStageId ? new Date() : undefined,
        dealValue: row.deal_value ? Number(row.deal_value.replace(/[^0-9.]/g, '')) || undefined : undefined,
        assignedTo: row.assigned?.trim() || undefined,
        notes: row.notes?.trim() || undefined,
      },
    });
    await prisma.crmActivity.create({
      data: { leadId: created.id, type: 'imported', description: `Lead "${leadFullName(created)}" imported from CSV.` },
    });
    await fireTrigger('lead_created', created.id);

    if (row.follow_up?.trim()) {
      const due = new Date(row.follow_up.trim());
      if (!Number.isNaN(due.getTime())) {
        await prisma.crmFollowUp.create({
          data: { leadId: created.id, title: 'Follow up (imported)', dueAt: due, reminderAt: due, priority: 'normal' },
        });
      }
    }

    results.push({ row: i + 1, status: 'imported', leadId: created.id });
    imported += 1;
  }

  res.json({ imported, duplicates, skipped, results });
});

/** Cross-lead activity feed (the CRM "Activities" page) — registered before `GET /:id`. */
leadsRouter.get('/activities', async (req: AuthedRequest, res) => {
  const { page = '1', pageSize = '20', search, type, dateFrom, dateTo } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 20);

  // Scoped through the lead it belongs to — an activity is as private as its lead.
  const scoped = ownerScope(req.scope);
  const where: Prisma.CrmActivityWhereInput = Object.keys(scoped).length ? { lead: scoped } : {};
  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { userName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (type && type !== 'all') where.type = type;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as any).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as any).lte = new Date(dateTo);
  }

  const [items, total] = await Promise.all([
    prisma.crmActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
      include: { lead: { select: { firstName: true, lastName: true } } },
    }),
    prisma.crmActivity.count({ where }),
  ]);

  res.json({
    items: items.map(({ lead, ...a }) => ({ ...a, leadName: leadFullName(lead) })),
    total,
    page: pageNum,
    pageSize: size,
  });
});

// ---------------------------------------------------------------------------
// Single-lead routes
// ---------------------------------------------------------------------------

leadsRouter.get('/:id', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const lead = await prisma.crmLead.findUnique({
    where: { id: String(req.params.id) },
    include: {
      tags: { include: { tag: true } },
      stage: true,
      pipeline: true,
      sourceConnection: true,
      // Answers to custom fields — form questions the built-in columns have no home for.
      customValues: { include: { field: true } },
    },
  });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({
    ...lead,
    tagIds: lead.tags.map((t) => t.tagId),
    customFields: lead.customValues
      .sort((a, b) => a.field.sortOrder - b.field.sortOrder || a.field.label.localeCompare(b.field.label))
      .map((v) => ({ key: v.field.key, label: v.field.label, type: v.field.type, value: v.value })),
  });
});

/**
 * Columns a lead edit may never write. The legacy CRM passed the body straight to Prisma; in TaskBoard some
 * columns are links other modules rely on (the migrated TaskBoard lead, the Client a won lead became,
 * the importers' normalised contact keys) or provenance nobody should be able to rewrite.
 */
const PATCH_FORBIDDEN = new Set([
  'id', 'createdAt', 'updatedAt',
  'legacyLeadId', 'convertedClientId', 'phoneNormalized', 'emailNormalized',
  'externalLeadId', 'sourceConnectionId', 'sourceConnection', 'adDetail', 'formAnswers', 'receivedOutsideBusinessHours',
  // Relations: changed through their own endpoints, which keep history.
  'tags', 'activities', 'stage', 'pipeline', 'customValues', 'followUps',
]);

leadsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const refused = Object.keys(body).filter((k) => PATCH_FORBIDDEN.has(k));
  if (refused.length) return res.status(400).json({ error: `These fields cannot be edited here: ${refused.join(', ')}.` });
  // The same rule the assign endpoints enforce — without it an edit could hand the lead to anyone.
  if (typeof body.assignedUserId === 'string' && body.assignedUserId && !canAssignTo(req.scope, body.assignedUserId)) {
    return res.status(403).json({ error: 'You can only assign leads to yourself or to someone in your own team.' });
  }
  const before = body.leadScore !== undefined ? await prisma.crmLead.findUnique({ where: { id: String(req.params.id) }, select: { leadScore: true } }) : null;
  // Only a missing row is a 404. A bad field is the caller's mistake and is reported as a 400
  // (see errorResponse in ../index.ts) instead of the legacy CRM's catch-all "Lead not found".
  const updated = await prisma.crmLead
    .update({ where: { id: String(req.params.id) }, data: body as Prisma.CrmLeadUncheckedUpdateInput })
    .catch((err: unknown) => {
      if ((err as { code?: string })?.code === 'P2025') return null;
      throw err;
    });
  if (!updated) return res.status(404).json({ error: 'Lead not found' });
  if (before && updated.leadScore !== before.leadScore) await fireTrigger('lead_score_threshold', updated.id);
  res.json(updated);
});

leadsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  await prisma.crmLead.delete({ where: { id: String(req.params.id) } }).catch(() => undefined);
  res.status(204).send();
});

leadsRouter.post('/:id/status', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const { status, lostReason } = req.body as { status: string; lostReason?: string };
  const lead = await prisma.crmLead.findUnique({ where: { id: String(req.params.id) } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const data: Record<string, unknown> = { status };
  if (status === 'won') {
    data.wonAt = new Date();
    data.wonValue = lead.dealValue;
  }
  if (status === 'lost') {
    data.lostAt = new Date();
    data.lostReason = lostReason;
  }

  const updated = await prisma.crmLead.update({ where: { id: String(req.params.id) }, data });
  await prisma.crmActivity.create({
    data: { leadId: lead.id, type: 'status_changed', description: `Status changed from "${lead.status}" to "${status}".` },
  });
  res.json(updated);
});

leadsRouter.post('/:id/assign', async (req: AuthedRequest, res) => {
  const { userId } = req.body as { userId?: string };
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  if (userId && !canAssignTo(req.scope, userId)) {
    return res.status(403).json({ error: 'You can only assign leads to yourself or to someone in your own team.' });
  }
  const before = await prisma.crmLead.findUnique({ where: { id: String(req.params.id) } });
  if (!before) return res.status(404).json({ error: 'Lead not found' });

  const actor = await actingUser(req);
  const updated = await prisma.crmLead.update({ where: { id: String(req.params.id) }, data: { assignedUserId: userId || null } });
  await prisma.crmAssignmentHistoryEntry.create({
    data: { leadId: updated.id, fromUserId: before.assignedUserId, toUserId: userId || null, actorName: actor.name },
  });
  await prisma.crmActivity.create({
    data: { leadId: updated.id, type: 'assigned', description: userId ? 'Reassigned.' : 'Unassigned.', userName: actor.name },
  });
  if (userId) await fireTrigger('lead_assigned', updated.id);
  res.json(updated);
});

leadsRouter.post('/:id/star', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const lead = await prisma.crmLead.findUnique({ where: { id: String(req.params.id) } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const updated = await prisma.crmLead.update({ where: { id: String(req.params.id) }, data: { isStarred: !lead.isStarred } });
  res.json(updated);
});

leadsRouter.post('/:id/stage', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const { pipelineId, stageId } = req.body as { pipelineId: string; stageId: string };
  const [lead, toStage] = await Promise.all([
    prisma.crmLead.findUnique({ where: { id: String(req.params.id) }, include: { stage: true } }),
    prisma.crmPipelineStage.findUnique({ where: { id: stageId } }),
  ]);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const data: Record<string, unknown> = { pipelineId, pipelineStageId: stageId, stageEnteredAt: new Date() };
  if (toStage?.isWon) data.status = 'won';
  if (toStage?.isLost) data.status = 'lost';

  const actor = await actingUser(req);
  const updated = await prisma.crmLead.update({ where: { id: String(req.params.id) }, data });
  await prisma.crmStageHistoryEntry.create({
    data: {
      leadId: lead.id,
      fromStageName: lead.stage?.name,
      toStageName: toStage?.name ?? 'Unknown',
      actorName: actor.name,
    },
  });
  await prisma.crmActivity.create({
    data: {
      leadId: lead.id,
      type: 'stage_moved',
      description: `Moved from "${lead.stage?.name ?? 'Unassigned'}" to "${toStage?.name ?? 'Unknown'}".`,
      userName: actor.name,
    },
  });
  await fireTrigger('lead_stage_changed', lead.id, { fromStageId: lead.pipelineStageId ?? undefined, toStageId: stageId });
  res.json(updated);
});

leadsRouter.post('/:id/tags/:tagId', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  await prisma.crmTagOnLead
    .create({ data: { leadId: String(req.params.id), tagId: String(req.params.tagId) } })
    .catch(() => undefined); // already applied — ignore the unique-constraint error
  await fireTrigger('tag_added', String(req.params.id), { tagId: String(req.params.tagId) });
  res.status(204).send();
});

leadsRouter.delete('/:id/tags/:tagId', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  await prisma.crmTagOnLead
    .delete({ where: { leadId_tagId: { leadId: String(req.params.id), tagId: String(req.params.tagId) } } })
    .catch(() => undefined);
  res.status(204).send();
});

leadsRouter.get('/:id/activities', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const rows = await prisma.crmActivity.findMany({ where: { leadId: String(req.params.id) }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

leadsRouter.post('/:id/activities', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const { type, description } = req.body as { type: string; description: string };
  const actor = await actingUser(req);
  const row = await prisma.crmActivity.create({
    data: { leadId: String(req.params.id), type, description, userName: actor.name },
  });
  res.status(201).json(row);
});

leadsRouter.get('/:id/notes', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const rows = await prisma.crmNote.findMany({ where: { leadId: String(req.params.id) }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

leadsRouter.post('/:id/notes', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const { body } = req.body as { body: string };
  const actor = await actingUser(req);
  const note = await prisma.crmNote.create({
    data: { leadId: String(req.params.id), userId: actor.id, userName: actor.name, body },
  });
  await prisma.crmActivity.create({
    data: { leadId: String(req.params.id), type: 'note_added', description: 'Note added.', userName: actor.name },
  });
  res.status(201).json(note);
});

leadsRouter.get('/:id/followups', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const rows = await prisma.crmFollowUp.findMany({ where: { leadId: String(req.params.id) }, orderBy: { dueAt: 'asc' } });
  res.json(rows);
});

/** Stage-move + reassignment history for the lead detail page's "History" tab. */
leadsRouter.get('/:id/history', async (req: AuthedRequest, res) => {
  if (!(await visibleLead(req, String(req.params.id)))) return res.status(404).json({ error: 'Lead not found' });
  const [stageHistory, assignmentHistory] = await Promise.all([
    prisma.crmStageHistoryEntry.findMany({ where: { leadId: String(req.params.id) }, orderBy: { createdAt: 'desc' } }),
    prisma.crmAssignmentHistoryEntry.findMany({ where: { leadId: String(req.params.id) }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({ stageHistory, assignmentHistory });
});
