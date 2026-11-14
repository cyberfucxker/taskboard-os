import { prisma } from '../prisma';
import { notify } from './notify';

/**
 * Follow-up reminders.
 *
 * The follow-up table has carried a `reminderAt` since it was written, and nothing ever read
 * it: a follow-up only existed on a screen somebody had to remember to open. This pass is
 * the missing half — when a reminder falls due it goes to whoever owns the task, through the
 * same `notify()` every other notification uses, so it lands in the TaskBoard bell and as a browser
 * push in one call.
 *
 * Sent exactly once: `reminderSentAt` is claimed before the reminder goes out, and released
 * again only if delivery failed.
 */

/** Older than this and the moment has passed — mark it done rather than nag about last week. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** One tick's worth. Bounded so a long outage drains over several ticks instead of one storm. */
const BATCH = 100;

function whenText(due: Date): string {
  return due.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: process.env.ORG_TIME_ZONE || 'Asia/Kolkata',
  });
}

export async function sendDueFollowUpReminders(): Promise<{ sent: number; skipped: number; stale: number }> {
  const now = new Date();

  const due = await prisma.crmFollowUp.findMany({
    where: {
      reminderSentAt: null,
      reminderAt: { not: null, lte: now },
      completed: false,
      status: { in: ['pending', 'rescheduled'] },
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, phone: true, assignedUserId: true } },
    },
    orderBy: { reminderAt: 'asc' },
    take: BATCH,
  });

  let sent = 0;
  let skipped = 0;
  let stale = 0;

  for (const followUp of due) {
    const isStale = now.getTime() - followUp.reminderAt!.getTime() > STALE_AFTER_MS;
    if (isStale) {
      await prisma.crmFollowUp.update({ where: { id: followUp.id }, data: { reminderSentAt: now } });
      stale += 1;
      continue;
    }

    // The task's own assignee first, then whoever owns the lead. Nobody at all means nobody to
    // tell: left alone, so it goes out the moment the lead is assigned rather than vanishing.
    const recipientId = followUp.assignedUserId ?? followUp.lead.assignedUserId;
    if (!recipientId) {
      skipped += 1;
      continue;
    }

    const leadName = `${followUp.lead.firstName} ${followUp.lead.lastName}`.trim() || followUp.lead.phone;

    // Claimed before it is sent: an overlapping tick that also picked this row up loses the
    // updateMany and skips it, so a reminder cannot go out twice.
    const claim = await prisma.crmFollowUp.updateMany({
      where: { id: followUp.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claim.count === 0) continue;

    const result = await notify({
      title: `Follow-up due: ${leadName}`,
      body: `${followUp.title} · ${whenText(followUp.dueAt)}`,
      userIds: [recipientId],
      type: 'system',
      // What the bell needs to open the lead straight from the notification.
      data: { kind: 'follow_up', leadId: followUp.leadId, followUpId: followUp.id },
    });
    if (result.pushed > 0) {
      sent += 1;
    } else {
      // Released on purpose: a delivery hiccup should mean "try again next tick",
      // not "this person never hears about their call".
      await prisma.crmFollowUp.update({ where: { id: followUp.id }, data: { reminderSentAt: null } });
      console.error(`[crm] follow-up reminder ${followUp.id} could not be delivered; will retry next tick`);
    }
  }

  return { sent, skipped, stale };
}

// The legacy CRM started a 60-second setInterval poller here (startFollowUpReminderPoller). TaskBoard runs
// no timers in the web process: sendDueFollowUpReminders is called once per CRM tick instead.
