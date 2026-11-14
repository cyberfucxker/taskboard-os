import crypto from 'crypto';
import { Router } from '../express';
import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { CRM_API_BASE } from '../config';
import { prisma } from '../prisma';
import { encrypt } from '../services/crypto';
import { writeAudit } from '../services/audit';
import type { AuthedRequest } from '../services/auth';
import { getEmailSettings, sendRawEmail, suppress } from '../services/email';

export const emailSettingsRouter = Router();

function publicSettings(settings: Awaited<ReturnType<typeof getEmailSettings>>) {
  return {
    provider: settings.provider,
    enabled: settings.enabled,
    // Never returned. The UI shows whether one is stored and lets it be replaced.
    hasApiKey: !!settings.apiKey,
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    replyToEmail: settings.replyToEmail,
    footerText: settings.footerText,
    inboundWebhookUrl: `${CRM_API_BASE}/webhook/email/${settings.inboundWebhookToken}/inbound`,
  };
}

emailSettingsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(publicSettings(await getEmailSettings()));
  } catch (err) {
    next(err);
  }
});

emailSettingsRouter.patch('/', async (req: AuthedRequest, res, next) => {
  try {
    await getEmailSettings();
    const body = req.body ?? {};
    const data: Prisma.CrmEmailSettingsUncheckedUpdateInput = {};
    if (body.enabled !== undefined) data.enabled = !!body.enabled;
    if (body.fromName !== undefined) data.fromName = String(body.fromName).trim();
    if (body.fromEmail !== undefined) data.fromEmail = String(body.fromEmail).trim().toLowerCase();
    if (body.replyToEmail !== undefined) data.replyToEmail = String(body.replyToEmail).trim().toLowerCase();
    if (body.footerText !== undefined) data.footerText = String(body.footerText).trim();
    // Blank means "leave the stored key alone" — the UI never sees it to send it back.
    if (body.apiKey) data.apiKey = encrypt(String(body.apiKey).trim());

    const updated = await prisma.crmEmailSettings.update({ where: { id: 'default' }, data });
    await writeAudit(req, { module: 'Settings', action: 'Updated email settings', recordId: 'default', recordLabel: 'Email' });
    res.json(publicSettings(updated));
  } catch (err) {
    next(err);
  }
});

emailSettingsRouter.post('/rotate-inbound', async (req: AuthedRequest, res, next) => {
  try {
    await getEmailSettings();
    const updated = await prisma.crmEmailSettings.update({
      where: { id: 'default' },
      data: { inboundWebhookToken: crypto.randomBytes(18).toString('hex') },
    });
    await writeAudit(req, { module: 'Settings', action: 'Rotated inbound email URL', recordId: 'default', recordLabel: 'Email' });
    res.json(publicSettings(updated));
  } catch (err) {
    next(err);
  }
});

/** Proves the key, the From address and the domain verification in one go. */
emailSettingsRouter.post('/test', async (req, res, next) => {
  try {
    const to = String(req.body?.to ?? '').trim();
    if (!to.includes('@')) return res.status(400).json({ error: 'A valid recipient address is required.' });
    await sendRawEmail(
      to,
      'Test email from Acme CRM',
      '<p>This is a test from the Acme CRM.</p><p>If it reached your inbox and not spam, sending is configured correctly.</p>'
    );
    res.json({ ok: true, message: `Test email sent to ${to}.` });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return res.status(502).json({
        error: `Provider rejected the send (${err.response?.status ?? 'no response'}).`,
        providerResponse: err.response?.data,
      });
    }
    if (err instanceof Error) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Suppression list
// ---------------------------------------------------------------------------

emailSettingsRouter.get('/suppressions', async (_req, res, next) => {
  try {
    const rows = await prisma.crmEmailSuppression.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    res.json(rows.map((r) => ({ id: r.id, email: r.email, reason: r.reason, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    next(err);
  }
});

emailSettingsRouter.post('/suppressions', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim();
    if (!email.includes('@')) return res.status(400).json({ error: 'A valid email address is required.' });
    await suppress(email, 'manual');
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

emailSettingsRouter.delete('/suppressions/:id', async (req, res, next) => {
  try {
    await prisma.crmEmailSuppression.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
