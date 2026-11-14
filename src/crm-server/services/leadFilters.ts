import type { Prisma } from '@prisma/client';
import { ownerScope, type DataScope } from './hierarchy';

/**
 * The lead list's filters, in one place.
 *
 * Both the Leads table and the WhatsApp broadcast audience ask the same question — "which
 * leads match this?" — and they have to agree. A count on the broadcast screen that came from
 * a different where-clause than the list it claims to mirror is worse than no count at all.
 */
export interface LeadFilter {
  search?: string;
  status?: string;
  priority?: string;
  source?: string;
  pipelineId?: string;
  stageId?: string;
  /** One id, several comma-separated, or `none` for unassigned — `none` may be mixed in. */
  assignedUserId?: string;
  tagId?: string;
  starred?: boolean;
  /** Created between these two dates, inclusive of both. Plain YYYY-MM-DD, read as IST. */
  dateFrom?: string;
  dateTo?: string;
  /** The lead's *newest* activity falls between these two — not merely some activity. */
  lastActivityFrom?: string;
  lastActivityTo?: string;
  /** Meta ad attribution. Matched on the names, which is what a person recognises. */
  campaignName?: string;
  adName?: string;
  /** The Meta lead form. The most specific attribution this account's token can see. */
  formName?: string;
  /**
   * Who is asking. Narrows the result to their own hierarchy — themselves plus everyone
   * reporting up to them — before any of the filters above are applied. Left out only by the
   * background engines, which act as the system rather than as a person.
   */
  scope?: DataScope;
  /** Pipeline IDs the calling user is not allowed to see — leads in these are excluded. */
  forbiddenPipelineIds?: string[];
}

/**
 * The two ends of a date filter, read in IST.
 *
 * Everything is pinned to +05:30 rather than parsed in the server's zone — UTC in production —
 * because without it a lead created at 2am IST falls into the day before, which is exactly the
 * off-by-one the team keeps reporting.
 *
 * Both shapes are accepted, because two pickers feed these: `YYYY-MM-DD` from a date input,
 * and `YYYY-MM-DDTHH:mm` from a datetime one. A bare day means the WHOLE day — midnight to
 * 23:59:59.999 — so switching a picker from date to datetime cannot silently narrow a filter
 * somebody already had saved.
 */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(value: string): Date {
  if (DAY_ONLY.test(value)) return new Date(`${value}T00:00:00.000+05:30`);
  // The START of the minute picked: "from 14:30" includes 14:30:00.
  return new Date(`${withSeconds(value, '00')}.000+05:30`);
}

function endOfDay(value: string): Date {
  if (DAY_ONLY.test(value)) return new Date(`${value}T23:59:59.999+05:30`);
  // The END of it: "to 14:30" still includes everything that happened during 14:30.
  return new Date(`${withSeconds(value, '59')}.999+05:30`);
}

/** A datetime-local input omits seconds; fill in whichever end of the minute is wanted. */
function withSeconds(value: string, seconds: '00' | '59'): string {
  const trimmed = value.trim();
  return /T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:${seconds}` : trimmed;
}

/** `all` and empty both mean "do not filter on this", which is how the selects send them. */
function chosen(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text && text !== 'all' ? text : undefined;
}

export function buildLeadWhere(filter: LeadFilter): Prisma.CrmLeadWhereInput {
  // The hierarchy comes first and is never overridden: a filter the client sends can only ever
  // narrow what follows, so asking for somebody else's leads by id returns nothing rather than
  // theirs.
  const where: Prisma.CrmLeadWhereInput = { ...ownerScope(filter.scope) };
  /** Conditions that cannot sit on `where` directly, because something else already owns the
   *  key or because they are an OR of their own. Merged into `where.AND` at the end. */
  const extraAnd: Prisma.CrmLeadWhereInput[] = [];

  const search = chosen(filter.search);
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { id: { contains: search } },
    ];
  }

  const status = chosen(filter.status);
  if (status === 'active') {
    (where as any).status = { notIn: ['won', 'lost'] };
  } else if (status) {
    where.status = status as Prisma.CrmLeadWhereInput['status'];
  }

  const priority = chosen(filter.priority);
  if (priority) where.priority = priority as Prisma.CrmLeadWhereInput['priority'];

  const source = chosen(filter.source);
  if (source) where.source = source;

  // `none` means "not on any pipeline at all" — a lead nobody has slotted into a process yet,
  // which is exactly the pile somebody wants to find and clear.
  const pipelineId = chosen(filter.pipelineId);
  if (pipelineId === 'none') where.pipelineId = null;
  else if (pipelineId) where.pipelineId = pipelineId;

  /**
   * One stage, several, or none at all.
   *
   * `stageId` takes a comma-separated list so the Leads filter can tick more than one without
   * a second parameter, and so the Kanban board's existing `stageId=none` keeps working
   * unchanged. `none` may be mixed in with real ids — "Interested, Visit Book, or sitting on
   * no stage" is a question somebody clearing up a pipeline actually asks.
   */
  const stageRaw = chosen(filter.stageId);
  if (stageRaw) {
    const parts = stageRaw.split(',').map((v) => v.trim()).filter(Boolean);
    const wantsNone = parts.includes('none');
    const ids = parts.filter((v) => v !== 'none');

    if (wantsNone && ids.length > 0) {
      // Two different shapes of condition on one column, so they go in an AND entry rather
      // than on `where` — and in `AND` rather than `OR`, which the search already owns.
      extraAnd.push({ OR: [{ pipelineStageId: null }, { pipelineStageId: { in: ids } }] });
    } else if (wantsNone) {
      where.pipelineStageId = null;
    } else if (ids.length === 1) {
      where.pipelineStageId = ids[0];
    } else if (ids.length > 1) {
      where.pipelineStageId = { in: ids };
    }
  }

  /**
   * One person, several, or nobody — a comma-separated list, exactly like `stageId` above.
   * "Gaurav's and Riley's leads" is one question, and answering it meant running the list twice.
   *
   * Two things are dropped rather than honoured, and both drop to "matches nothing" rather
   * than "matches everything", because a filter that silently widens is the dangerous kind:
   * ids outside the caller's own hierarchy, and `none` asked for by somebody who cannot see
   * unassigned leads in the first place.
   */
  const assignedRaw = chosen(filter.assignedUserId);
  if (assignedRaw) {
    const parts = assignedRaw.split(',').map((v) => v.trim()).filter(Boolean);
    const seesUnassigned = !filter.scope || filter.scope.isAll;
    const wantsNone = parts.includes('none') && seesUnassigned;
    const ids = parts
      .filter((v) => v !== 'none')
      .filter((id) => !filter.scope || filter.scope.isAll || filter.scope.userIds.includes(id));

    if (wantsNone && ids.length > 0) {
      extraAnd.push({ OR: [{ assignedUserId: null }, { assignedUserId: { in: ids } }] });
    } else if (wantsNone) {
      where.assignedUserId = null;
    } else if (ids.length === 1) {
      where.assignedUserId = ids[0];
    } else if (ids.length > 1) {
      where.assignedUserId = { in: ids };
    } else {
      // Something was asked for and none of it survived. Answer nothing.
      where.assignedUserId = { in: [] };
    }
  }

  const tagId = chosen(filter.tagId);
  if (tagId) where.tags = { some: { tagId } };

  if (filter.starred) where.isStarred = true;

  // Campaign is on utmCampaign for every Meta lead ever ingested; the ad name only exists on
  // the ones that arrived after adDetail was added, so it is matched inside that object.
  const campaignName = chosen(filter.campaignName);
  if (campaignName) where.utmCampaign = campaignName;

  const adName = chosen(filter.adName);
  if (adName) where.adDetail = { path: ['adName'], equals: adName };

  const formName = chosen(filter.formName);
  if (formName) where.adDetail = { path: ['formName'], equals: formName };

  const from = chosen(filter.dateFrom);
  const to = chosen(filter.dateTo);
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: startOfDay(from) } : {}),
      // Inclusive of the end date: someone picking a single day means that whole day.
      ...(to ? { lte: endOfDay(to) } : {}),
    };
  }

  const activityFrom = chosen(filter.lastActivityFrom);
  const activityTo = chosen(filter.lastActivityTo);
  if (activityFrom || activityTo) {
    // "Last activity in this window", not "any activity in this window" — which are different
    // questions, and only the first one matches the column the list shows. A lead qualifies
    // when it has an activity inside the window and none after it, so the newest one is the
    // one that landed there. An end date alone still needs `some`, or a lead that has never
    // had any activity would pass on the strength of having nothing after the window.
    const AND: Prisma.CrmLeadWhereInput[] = [];
    AND.push({
      activities: {
        some: {
          createdAt: {
            ...(activityFrom ? { gte: startOfDay(activityFrom) } : {}),
            ...(activityTo ? { lte: endOfDay(activityTo) } : {}),
          },
        },
      },
    });
    if (activityTo) AND.push({ activities: { none: { createdAt: { gt: endOfDay(activityTo) } } } });
    extraAnd.push(...AND);
  }

  if (filter.forbiddenPipelineIds && filter.forbiddenPipelineIds.length > 0) {
    extraAnd.push({ pipelineId: { notIn: filter.forbiddenPipelineIds } });
  }

  if (extraAnd.length > 0) where.AND = extraAnd;

  return where;
}
