import { Router } from '../express';
import { prisma } from '../prisma';
import type { Prisma } from '@prisma/client';
import type { AuthedRequest } from '../services/auth';
import { ownerScope } from '../services/hierarchy';

/**
 * A follow-up is as private as the lead it hangs off. Scoping through `lead` rather than the
 * follow-up's own `assignedUserId` is deliberate: a team leader must still see a task sitting
 * on one of their team's leads even when nobody has picked the task up yet.
 */
function followUpScope(req: AuthedRequest): Prisma.CrmFollowUpWhereInput {
  const scoped = ownerScope(req.scope);
  return Object.keys(scoped).length ? { lead: scoped } : {};
}

export const followUpsRouter = Router();

function bucketRange() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  return { todayStart, todayEnd };
}

followUpsRouter.get('/', async (req: AuthedRequest, res) => {
  const { page = '1', pageSize = '10', status, priority, assignedUserId, bucket, sortBy } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 10);

  const where: Prisma.CrmFollowUpWhereInput = { ...followUpScope(req) };
  if (status && status !== 'all') where.status = status;
  if (priority && priority !== 'all') where.priority = priority as any;
  if (assignedUserId && assignedUserId !== 'all') where.assignedUserId = assignedUserId;

  if (bucket && bucket !== 'all') {
    const { todayStart, todayEnd } = bucketRange();
    const isOpen: Prisma.CrmFollowUpWhereInput = { OR: [{ status: 'pending' }, { status: 'rescheduled' }] };
    if (bucket === 'overdue') Object.assign(where, isOpen, { dueAt: { lt: todayStart } });
    if (bucket === 'today') Object.assign(where, isOpen, { dueAt: { gte: todayStart, lte: todayEnd } });
    if (bucket === 'upcoming') Object.assign(where, isOpen, { dueAt: { gt: todayEnd } });
  }

  const [items, total] = await Promise.all([
    prisma.crmFollowUp.findMany({
      where,
      orderBy: { dueAt: sortBy === 'dueAt' ? 'asc' : 'asc' },
      skip: (pageNum - 1) * size,
      take: size,
      include: { lead: { select: { firstName: true, lastName: true } } },
    }),
    prisma.crmFollowUp.count({ where }),
  ]);

  res.json({
    items: items.map(({ lead, ...f }) => ({ ...f, leadName: `${lead.firstName} ${lead.lastName}`.trim() })),
    total,
    page: pageNum,
    pageSize: size,
  });
});

/**
 * Calendar feed: every follow-up due within [from, to], un-paginated — the month grid needs the
 * whole window at once, not a page of it. Registered ABOVE `/:id` on purpose: Express matches in
 * order, so a `/calendar` request would otherwise be read as a follow-up with the id "calendar".
 */
followUpsRouter.get('/calendar', async (req: AuthedRequest, res) => {
  const { from, to, status, priority, assignedUserId } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'from and to must be valid ISO dates.' });
  }
  if (toDate < fromDate) return res.status(400).json({ error: 'to must not be earlier than from.' });
  // A month grid spans at most 42 days; the cap keeps a hand-edited URL from scanning the table.
  const spanDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (spanDays > 92) return res.status(400).json({ error: 'Range must not exceed 92 days.' });

  const where: Prisma.CrmFollowUpWhereInput = { ...followUpScope(req), dueAt: { gte: fromDate, lte: toDate } };
  if (status && status !== 'all') where.status = status;
  if (priority && priority !== 'all') where.priority = priority as any;
  if (assignedUserId && assignedUserId !== 'all') where.assignedUserId = assignedUserId;

  const items = await prisma.crmFollowUp.findMany({
    where,
    orderBy: { dueAt: 'asc' },
    include: { lead: { select: { firstName: true, lastName: true } } },
  });

  res.json(items.map(({ lead, ...f }) => ({ ...f, leadName: `${lead.firstName} ${lead.lastName}`.trim() })));
});

/**
 * The follow-ups that should be on somebody's screen RIGHT NOW.
 *
 * Distinct from the bell, which is a list you go and look at. This feeds a dialog that comes
 * to you, so it answers a narrower question: which of MY open follow-ups has crossed one of
 * its warning marks and not been dealt with.
 *
 * Four marks, and the phase plus the bucket say which one: fifteen minutes out, five minutes
 * out, at the due time, and once more fifteen minutes after that. Then it stops.
 *
 * Stopping is deliberate. A dialog that blocks the screen every quarter hour for the rest of
 * the day stops being a reminder and becomes something people learn to dismiss without
 * reading — at which point it is worse than nothing. Two chances at the moment it matters,
 * and after that the task is still sitting in Follow-ups under Overdue, which is where a
 * thing nobody has dealt with belongs.
 *
 * Whose: the task's own assignee, or the lead's owner when the task has none — the same rule
 * the reminder poller uses, so the dialog and the push cannot disagree about who is on the
 * hook. Registered before `/:id` or "due-alerts" would be read as an id.
 */
const ALERT_LEAD_MINUTES = 15;
const OVERDUE_REPEAT_MINUTES = 15;
/** Buckets 0 and 1 — at the due time, and a quarter hour later. Nothing after that. */
const MAX_OVERDUE_BUCKET = 1;

followUpsRouter.get('/due-alerts', async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.auth!.sub;
    const now = new Date();
    const horizon = new Date(now.getTime() + ALERT_LEAD_MINUTES * 60_000);

    const rows = await prisma.crmFollowUp.findMany({
      where: {
        ...followUpScope(req),
        completed: false,
        status: { in: ['pending', 'rescheduled'] },
        dueAt: { lte: horizon },
        OR: [
          { assignedUserId: userId },
          // An unclaimed task belongs to whoever owns the lead.
          { assignedUserId: null, lead: { assignedUserId: userId } },
        ],
      },
      include: { lead: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      orderBy: { dueAt: 'asc' },
      // A screenful at most: if somebody has fifty overdue tasks, a dialog is not the fix.
      take: 20,
    });

    const alerts = rows
      .map((f) => {
        const minutesUntilDue = Math.round((f.dueAt.getTime() - now.getTime()) / 60_000);
        const phase = minutesUntilDue <= 0 ? 'overdue' : minutesUntilDue <= 5 ? 't5' : 't15';
        return {
          id: f.id,
          title: f.title,
          description: f.description,
          dueAt: f.dueAt.toISOString(),
          priority: f.priority,
          leadId: f.leadId,
          leadName: `${f.lead.firstName} ${f.lead.lastName}`.trim() || f.lead.phone,
          leadPhone: f.lead.phone,
          phase,
          minutesUntilDue,
          /// 0 for the first quarter hour past due, 1 for the second. Null before the due time.
          overdueBucket:
            phase === 'overdue' ? Math.floor(-minutesUntilDue / OVERDUE_REPEAT_MINUTES) : null,
        };
      })
      // Long-overdue tasks drop out of the dialog entirely rather than nagging forever. They
      // are still counted and listed on the Follow-ups screen, which is the right place for
      // work somebody has been ignoring.
      .filter((a) => a.overdueBucket === null || a.overdueBucket <= MAX_OVERDUE_BUCKET);

    res.json({ alerts });
  } catch (err) {
    next(err);
  }
});

followUpsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const row = await prisma.crmFollowUp.findFirst({
    where: { id: String(req.params.id), ...followUpScope(req) },
  });
  if (!row) return res.status(404).json({ error: 'Follow-up not found' });
  res.json(row);
});

followUpsRouter.post('/', async (req: AuthedRequest, res) => {
  const { leadId, title, description, dueAt, priority, assignedUserId, remindBeforeMinutes } = req.body as {
    leadId: string;
    title: string;
    description?: string;
    dueAt: string;
    priority?: string;
    assignedUserId?: string;
    /** How long before the due time to nudge the owner. 0 (the default) means at the due time. */
    remindBeforeMinutes?: number;
  };
  if (!leadId || !title?.trim() || !dueAt) return res.status(400).json({ error: 'leadId, title and dueAt are required.' });

  const scoped = ownerScope(req.scope);
  const lead = await prisma.crmLead.findFirst({ where: { id: leadId, ...scoped }, select: { id: true } });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const created = await prisma.crmFollowUp.create({
    data: {
      leadId,
      title: title.trim(),
      description: description?.trim() || undefined,
      dueAt: new Date(dueAt),
      reminderAt: new Date(new Date(dueAt).getTime() - Math.max(0, Number(remindBeforeMinutes) || 0) * 60_000),
      priority: (priority as any) ?? 'normal',
      assignedUserId: assignedUserId || undefined,
    },
  });
  res.status(201).json(created);
});

followUpsRouter.post('/:id/status', async (req: AuthedRequest, res) => {
  const visible = await prisma.crmFollowUp.findFirst({
    where: { id: String(req.params.id), ...followUpScope(req) },
    select: { id: true },
  });
  if (!visible) return res.status(404).json({ error: 'Follow-up not found' });
  const { status } = req.body as { status: string };
  const updated = await prisma.crmFollowUp
    .update({
      where: { id: String(req.params.id) },
      data: {
        status,
        completed: status === 'completed',
        completedAt: status === 'completed' ? new Date() : null,
      },
    })
    .catch(() => null);
  if (!updated) return res.status(404).json({ error: 'Follow-up not found' });

  await prisma.crmActivity.create({
    data: { leadId: updated.leadId, type: 'note_added', description: `Follow-up "${updated.title}" marked as ${status}.` },
  });
  res.json(updated);
});

followUpsRouter.post('/:id/reschedule', async (req: AuthedRequest, res) => {
  const visible = await prisma.crmFollowUp.findFirst({
    where: { id: String(req.params.id), ...followUpScope(req) },
    select: { id: true },
  });
  if (!visible) return res.status(404).json({ error: 'Follow-up not found' });
  const { dueAt } = req.body as { dueAt: string };
  const updated = await prisma.crmFollowUp
    .update({ where: { id: String(req.params.id) }, data: { dueAt: new Date(dueAt), status: 'rescheduled', completed: false, completedAt: null } })
    .catch(() => null);
  if (!updated) return res.status(404).json({ error: 'Follow-up not found' });
  res.json(updated);
});
