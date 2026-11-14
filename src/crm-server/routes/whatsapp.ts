import crypto from 'crypto';
import { Router } from '../express';
import type { Prisma } from '@prisma/client';
import { CRM_API_BASE } from '../config';
import { prisma } from '../prisma';
import { encrypt } from '../services/crypto';
import { writeAudit } from '../services/audit';
import type { AuthedRequest } from '../services/auth';
import {
  canSendFreeform, normalizeWaNumber, sendTemplate, sendText, windowExpiresAt, WhatsAppError,
} from '../services/whatsapp';

export const whatsappRouter = Router();

function fail(err: unknown, res: any, next: (e?: unknown) => void) {
  if (err instanceof WhatsAppError) return res.status(err.httpStatus).json({ error: err.message });
  return next(err);
}

// ---------------------------------------------------------------------------
// Linked numbers
// ---------------------------------------------------------------------------

type AccountRow = Prisma.CrmWhatsAppAccountGetPayload<{ include: { _count: { select: { conversations: true } } } }>;

function serializeAccount(account: AccountRow, unread = 0) {
  return {
    id: account.id,
    label: account.label,
    displayPhone: account.displayPhone,
    phoneNumberId: account.phoneNumberId,
    wabaId: account.wabaId ?? undefined,
    active: account.active,
    status: account.status,
    lastError: account.lastError ?? undefined,
    createLeadOnInbound: account.createLeadOnInbound,
    hasAccessToken: !!account.accessToken,
    hasAppSecret: !!account.appSecret,
    verifyToken: account.verifyToken,
    webhookUrl: `${CRM_API_BASE}/webhook/whatsapp/${account.id}`,
    conversationCount: account._count.conversations,
    unreadCount: unread,
    lastMessageAt: account.lastMessageAt?.toISOString(),
  };
}

whatsappRouter.get('/accounts', async (_req, res, next) => {
  try {
    const accounts = await prisma.crmWhatsAppAccount.findMany({
      include: { _count: { select: { conversations: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // Unread totals in one grouped query rather than one per account.
    const unread = await prisma.crmWhatsAppConversation.groupBy({
      by: ['accountId'],
      where: { unreadCount: { gt: 0 } },
      _sum: { unreadCount: true },
    });
    const byAccount = new Map(unread.map((u) => [u.accountId, u._sum.unreadCount ?? 0]));
    res.json(accounts.map((a) => serializeAccount(a, byAccount.get(a.id) ?? 0)));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.post('/accounts', async (req: AuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const label = String(body.label ?? '').trim();
    const displayPhone = normalizeWaNumber(body.displayPhone);
    const phoneNumberId = String(body.phoneNumberId ?? '').trim();
    if (!label || !displayPhone || !phoneNumberId) {
      return res.status(400).json({ error: 'label, displayPhone and phoneNumberId are required.' });
    }

    const created = await prisma.crmWhatsAppAccount.create({
      data: {
        label,
        displayPhone,
        phoneNumberId,
        wabaId: body.wabaId ? String(body.wabaId).trim() : null,
        accessToken: body.accessToken ? encrypt(String(body.accessToken).trim()) : null,
        appSecret: body.appSecret ? encrypt(String(body.appSecret).trim()) : null,
        // Generated here rather than typed: it only has to match what we hand to Meta.
        verifyToken: crypto.randomBytes(12).toString('hex'),
        createLeadOnInbound: body.createLeadOnInbound !== false,
        active: body.active !== false,
      },
      include: { _count: { select: { conversations: true } } },
    });
    await writeAudit(req, { module: 'Settings', action: 'Linked a WhatsApp number', recordId: created.id, recordLabel: created.label });
    res.status(201).json(serializeAccount(created));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.patch('/accounts/:id', async (req: AuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const data: Prisma.CrmWhatsAppAccountUncheckedUpdateInput = {};
    if (body.label !== undefined) data.label = String(body.label).trim();
    if (body.displayPhone !== undefined) data.displayPhone = normalizeWaNumber(body.displayPhone);
    if (body.phoneNumberId !== undefined) data.phoneNumberId = String(body.phoneNumberId).trim();
    if (body.wabaId !== undefined) data.wabaId = String(body.wabaId).trim() || null;
    if (body.active !== undefined) data.active = !!body.active;
    if (body.createLeadOnInbound !== undefined) data.createLeadOnInbound = !!body.createLeadOnInbound;
    // Blank means "keep the stored one" — the UI never receives it to send back.
    if (body.accessToken) data.accessToken = encrypt(String(body.accessToken).trim());
    if (body.appSecret) data.appSecret = encrypt(String(body.appSecret).trim());

    const updated = await prisma.crmWhatsAppAccount.update({
      where: { id: String(req.params.id) },
      data,
      include: { _count: { select: { conversations: true } } },
    });
    await writeAudit(req, { module: 'Settings', action: 'Updated a WhatsApp number', recordId: updated.id, recordLabel: updated.label });
    res.json(serializeAccount(updated));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.delete('/accounts/:id', async (req: AuthedRequest, res, next) => {
  try {
    const removed = await prisma.crmWhatsAppAccount.delete({ where: { id: String(req.params.id) } });
    await writeAudit(req, { module: 'Settings', action: 'Unlinked a WhatsApp number', recordId: removed.id, recordLabel: removed.label });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

const conversationInclude = {
  lead: { select: { id: true, firstName: true, lastName: true, status: true } },
} satisfies Prisma.CrmWhatsAppConversationInclude;

type ConversationRow = Prisma.CrmWhatsAppConversationGetPayload<{ include: typeof conversationInclude }>;

function serializeConversation(row: ConversationRow) {
  const expiresAt = windowExpiresAt(row);
  return {
    id: row.id,
    accountId: row.accountId,
    contactPhone: row.contactPhone,
    contactName: row.contactName ?? undefined,
    leadId: row.leadId ?? undefined,
    leadName: row.lead ? `${row.lead.firstName} ${row.lead.lastName}`.trim() : undefined,
    leadStatus: row.lead?.status,
    assignedUserId: row.assignedUserId ?? undefined,
    lastMessageAt: row.lastMessageAt?.toISOString(),
    lastMessagePreview: row.lastMessagePreview ?? undefined,
    unreadCount: row.unreadCount,
    intervened: row.intervened,
    /// Minutes left in WhatsApp's 24-hour reply window; 0 once it has closed.
    windowMinutesLeft: expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : 0,
    canReply: canSendFreeform(row),
  };
}

whatsappRouter.get('/conversations', async (req, res, next) => {
  try {
    const accountId = String(req.query.accountId ?? '').trim();
    const tab = String(req.query.tab ?? 'all');
    const search = String(req.query.search ?? '').trim();
    const assignedUserId = String(req.query.assignedUserId ?? 'all');
    const leadStatus = String(req.query.leadStatus ?? 'all');

    const where: Prisma.CrmWhatsAppConversationWhereInput = { archived: false };
    if (accountId) where.accountId = accountId;
    if (assignedUserId !== 'all' && assignedUserId) where.assignedUserId = assignedUserId;
    if (leadStatus !== 'all' && leadStatus) where.lead = { status: leadStatus as never };
    // "Pending" is a thread waiting on us — unread inbound. "Intervened" is one a person
    // has already replied to. Both are derived, so neither can go stale.
    if (tab === 'pending') where.unreadCount = { gt: 0 };
    if (tab === 'intervened') where.intervened = true;
    if (search) {
      where.OR = [
        { contactName: { contains: search, mode: 'insensitive' } },
        { contactPhone: { contains: search } },
        { lastMessagePreview: { contains: search, mode: 'insensitive' } },
        { lead: { firstName: { contains: search, mode: 'insensitive' } } },
        { lead: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const rows = await prisma.crmWhatsAppConversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });
    res.json(rows.map(serializeConversation));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.get('/conversations/:id', async (req, res, next) => {
  try {
    const row = await prisma.crmWhatsAppConversation.findUnique({
      where: { id: String(req.params.id) },
      include: conversationInclude,
    });
    if (!row) return res.status(404).json({ error: 'Conversation not found' });
    res.json(serializeConversation(row));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const messages = await prisma.crmWhatsAppMessage.findMany({
      where: { conversationId: String(req.params.id) },
      orderBy: { sentAt: 'asc' },
      take: 500,
    });
    res.json(
      messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        body: m.body,
        mediaUrl: m.mediaUrl ?? undefined,
        status: m.status,
        error: m.error ?? undefined,
        sentByUserId: m.sentByUserId ?? undefined,
        sentAt: m.sentAt.toISOString(),
      }))
    );
  } catch (err) {
    next(err);
  }
});

whatsappRouter.post('/conversations/:id/messages', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const templateName = String(req.body?.templateName ?? '').trim();
    const result = templateName
      ? await sendTemplate(id, templateName, String(req.body?.languageCode ?? 'en'), req.auth?.sub)
      : await sendText(id, String(req.body?.body ?? ''), req.auth?.sub);
    res.status(201).json(result);
  } catch (err) {
    fail(err, res, next);
  }
});

/** Opening a thread clears its unread count — the "Pending" tab is driven by it. */
whatsappRouter.post('/conversations/:id/read', async (req, res, next) => {
  try {
    await prisma.crmWhatsAppConversation.update({ where: { id: String(req.params.id) }, data: { unreadCount: 0 } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

whatsappRouter.patch('/conversations/:id', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const data: Prisma.CrmWhatsAppConversationUncheckedUpdateInput = {};
    if (body.assignedUserId !== undefined) data.assignedUserId = String(body.assignedUserId) || null;
    if (body.archived !== undefined) data.archived = !!body.archived;
    const updated = await prisma.crmWhatsAppConversation.update({
      where: { id: String(req.params.id) },
      data,
      include: conversationInclude,
    });
    res.json(serializeConversation(updated));
  } catch (err) {
    next(err);
  }
});
