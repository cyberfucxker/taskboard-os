import { getOrCreateHiringPipeline } from '../services/hiringPipeline';
import { Router } from '../express';
import type { NextFunction, Request, Response } from '../express';
import { prisma } from '../prisma';
import type { Prisma } from '@prisma/client';
import { decrypt } from '../services/crypto';
import { verifySignature, fetchLeadData, getFormName } from '../services/metaService';
import { getFormDefinition } from '../services/formDefinitions';
import {
  fetchOptionLabels,
  saveCustomValues,
  ensureCustomFields,
  applyT7FieldMap,
  metaFormAnswersDoc,
  buildMetaNotesBlock,
} from '../services/leadFieldMapping';
import { recordInbound, recordStatus } from '../services/whatsapp';
import { ingestWebhookLead } from '../services/webhookIngest';
import { outsideBusinessHoursFlag } from '../services/businessHours';
import { fireTrigger } from '../services/automationEngine';
import { getSettings } from '../services/airphone';
import { getEmailSettings } from '../services/email';
import { recordCallLog, resolveAgentForCall } from '../services/callRouting';
import { describeRequest, logTelephonyEvent } from '../services/telephonyEvents';

export const webhookRouter = Router();

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || '';

webhookRouter.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

webhookRouter.post('/meta', async (req, res) => {
  res.sendStatus(200);
  void processMetaDelivery(req).catch((err) => console.error('[crm] meta webhook processing failed', err));
});


export async function processMetaDelivery(req: any) {
  const rawBody: Buffer = (req as any).rawBody;
  const signature = req.header('x-hub-signature-256');
  const body = req.body as {
    object?: string;
    entry?: { id: string; time: number; changes: { field: string; value: Record<string, any> }[] }[];
  };

  const entries = body.entry ?? [];
  for (const entry of entries) {
    const pageId = entry.id;
    const connection = await prisma.crmSourceConnection.findFirst({
      where: { source: 'meta', metaPageId: pageId, active: true },
    });

    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const leadgenId: string | undefined = change.value?.leadgen_id;
      const inboxUrl: string | undefined = change.value?.inbox_url;

      if (!connection) continue;

      if (!connection.metaAppSecret || !verifySignature(rawBody, signature, decrypt(connection.metaAppSecret))) {
        await prisma.crmIntegrationActivity.create({
          data: {
            connectionId: connection.id,
            source: 'meta',
            status: 'invalid_signature',
            errorMessage: 'X-Hub-Signature-256 verification failed.',
            rawPayload: body as any,
          },
        });
        continue;
      }

      try {
        if (!leadgenId || !connection.metaPageAccessToken) throw new Error('Missing leadgen_id or page access token.');
        const pageToken = decrypt(connection.metaPageAccessToken);
        const leadData = await fetchLeadData(leadgenId, pageToken);

        const optionLabels = leadData.form_id ? await fetchOptionLabels(leadData.form_id, pageToken) : {};
        const formDef = await getFormDefinition(leadData.form_id, pageToken);
        const formName = (leadData.form_id ? await getFormName(leadData.form_id, pageToken) : null) ?? formDef?.name ?? null;
        const formAnswers = metaFormAnswersDoc({ fieldData: leadData.field_data, questions: formDef?.questions, formId: leadData.form_id, formName, campaignName: leadData.campaign_name, submittedAt: leadData.created_time });

        const { lead: mapped, custom, hiringCustom, isHiring } = applyT7FieldMap(
          leadData.field_data,
          optionLabels,
          formName,
          leadData.campaign_name,
        );

        const existing = await prisma.crmLead.findFirst({
          where: { source: 'meta', externalLeadId: leadgenId },
        });

        let leadId: string;
        if (existing) {
          leadId = existing.id;
        } else {
          let pipelineId: string | undefined;
          let pipelineStageId: string | undefined;
          if (isHiring) {
            const hiringPlace = await getOrCreateHiringPipeline();
            pipelineId = hiringPlace.pipelineId;
            pipelineStageId = hiringPlace.pipelineStageId;
          }

          const platformLabel = leadData.platform
            ? (({ fb: "Facebook", ig: "Instagram", an: "Audience Network", msg: "Messenger" } as Record<string, string>)[leadData.platform.toLowerCase()] ?? leadData.platform)
            : 'Meta';
          const otherSourceParts = [platformLabel];
          if (leadData.campaign_name) otherSourceParts.push(leadData.campaign_name);
          if (formName) otherSourceParts.push(formName);
          const otherSource = otherSourceParts.join(' · ');

          await ensureCustomFields();

          const created = await prisma.crmLead.create({
            data: {
              firstName: mapped.firstName,
              lastName: mapped.lastName,
              email: mapped.email,
              phone: mapped.phone ?? '',
              city: mapped.city,
              company: mapped.company,
              jobTitle: mapped.jobTitle,
              website: mapped.website,
              industry: mapped.industry,
              country: mapped.country,
              requirement: mapped.requirement,
              serviceInterest: mapped.serviceInterest,
              budgetRange: mapped.budgetRange,
              services: mapped.services.length > 0 ? mapped.services : undefined,
              source: 'meta',
              otherSource,
              externalLeadId: leadgenId,
              sourceConnectionId: connection.id,
              utmSource: 'meta',
              utmMedium: 'paid_social',
              utmCampaign: leadData.campaign_name ?? undefined,
              utmContent: leadData.ad_name ?? undefined,
              utmTerm: leadData.adset_name ?? undefined,
              formAnswers: (formAnswers ?? undefined) as any,
              adDetail: {
                formName,
                formId: leadData.form_id ?? null,
                campaignId: leadData.campaign_id ?? null,
                campaignName: leadData.campaign_name ?? null,
                adsetId: leadData.adset_id ?? null,
                adsetName: leadData.adset_name ?? null,
                adId: leadData.ad_id ?? null,
                adName: leadData.ad_name ?? null,
                platform: leadData.platform ?? null,
                isOrganic: leadData.is_organic ?? null,
                inboxUrl: inboxUrl ?? null,
                pageId,
                leadgenId,
                createdTime: leadData.created_time ?? null,
              },
              ...(pipelineId ? { pipelineId, pipelineStageId, stageEnteredAt: new Date() } : {}),
              status: 'new',
              priority: 'normal',
              receivedOutsideBusinessHours: await outsideBusinessHoursFlag(),
            },
          });
          leadId = created.id;

          const allCustom = { ...custom, ...hiringCustom };
          await saveCustomValues(leadId, allCustom);

          const notesBody = buildMetaNotesBlock(leadData.field_data, optionLabels, formName, formDef?.questions);
          await prisma.crmNote.create({
            data: { leadId, userId: 'system', userName: 'Meta Lead Ads', body: notesBody },
          });

          await fireTrigger('lead_created', leadId);
          const fullName = `${mapped.firstName} ${mapped.lastName}`.trim();
          await prisma.crmActivity.create({
            data: {
              leadId,
              type: 'created',
              description: `Lead "${fullName}" ingested from Meta Lead Ads.`,
            },
          });
        }

        await prisma.crmSourceConnection.update({
          where: { id: connection.id },
          data: { lastReceivedAt: new Date(), status: 'connected', lastError: null },
        });

        await prisma.crmIntegrationActivity.create({
          data: {
            connectionId: connection.id,
            source: 'meta',
            status: 'processed',
            leadId,
            leadsCreated: existing ? 0 : 1,
            rawPayload: body as any,
            processedAt: new Date(),
          },
        });
      } catch (err) {
        const graph = (err as { response?: { data?: { error?: { message?: string; code?: number } } } })?.response?.data?.error;
        const message = graph?.message
          ? `Meta Graph API: ${graph.message}${graph.code ? ` (code ${graph.code})` : ''}`
          : err instanceof Error ? err.message : 'Unknown error processing lead.';

        try {
          const existingStub = leadgenId
            ? await prisma.crmLead.findFirst({ where: { source: 'meta', externalLeadId: leadgenId } })
            : null;
          if (!existingStub) {
            const stub = await prisma.crmLead.create({
              data: {
                firstName: `Meta Lead #${leadgenId?.slice(-4) ?? 'ERR'}`,
                lastName: '',
                phone: '',
                source: 'meta',
                externalLeadId: leadgenId,
                sourceConnectionId: connection.id,
                utmSource: 'meta',
                utmMedium: 'paid_social',
                adDetail: { leadgenId: leadgenId ?? null, pageId, importError: true, errorMessage: message },
                status: 'new',
                priority: 'normal',
              },
            });
            await prisma.crmActivity.create({
              data: {
                leadId: stub.id,
                type: 'created',
                description: `Stub lead created — Graph API error: ${message}`,
              },
            });
          }
        } catch (stubErr) {
          console.error('[crm] failed to create stub lead:', stubErr);
        }

        await prisma.crmSourceConnection.update({
          where: { id: connection.id },
          data: { status: 'error', lastError: message },
        });
        await prisma.crmIntegrationActivity.create({
          data: {
            connectionId: connection.id,
            source: 'meta',
            status: 'failed',
            errorMessage: message,
            rawPayload: body as any,
            processedAt: new Date(),
          },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API
// ---------------------------------------------------------------------------

webhookRouter.get('/whatsapp/:accountId', async (req, res) => {
  const account = await prisma.crmWhatsAppAccount.findUnique({ where: { id: String(req.params.accountId) } });
  if (!account) return res.sendStatus(404);
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === account.verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

webhookRouter.post('/whatsapp/:accountId', async (req, res) => {
  const account = await prisma.crmWhatsAppAccount.findUnique({ where: { id: String(req.params.accountId) } });
  if (!account || !account.active) return res.sendStatus(403);

  if (account.appSecret) {
    const rawBody: Buffer = (req as any).rawBody;
    if (!verifySignature(rawBody, req.header('x-hub-signature-256'), decrypt(account.appSecret))) {
      return res.sendStatus(403);
    }
  }

  res.sendStatus(200);

  try {
    const body = req.body as {
      entry?: { changes?: { field?: string; value?: any }[] }[];
    };
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value ?? {};
        const contactName: string | undefined = value.contacts?.[0]?.profile?.name;
        for (const message of value.messages ?? []) {
          await recordInbound(account, message, contactName);
        }
        for (const status of value.statuses ?? []) {
          await recordStatus(status);
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp] inbound failed:', err, JSON.stringify(req.body)?.slice(0, 500));
  }
});

// ---------------------------------------------------------------------------
// Inbound email
// ---------------------------------------------------------------------------

function inboundMessages(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  return body ? [body] : [];
}

function senderAddress(message: any): string {
  const raw =
    message?.from?.address ??
    message?.from?.[0]?.address ??
    message?.From ??
    message?.sender ??
    message?.from ??
    '';
  const match = String(raw).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0].toLowerCase() : '';
}

webhookRouter.post('/email/:token/inbound', async (req, res) => {
  const settings = await getEmailSettings();
  if (!settings.enabled || settings.inboundWebhookToken !== String(req.params.token)) return res.sendStatus(403);
  res.json({ status: 'ok' });
  try {
    for (const message of inboundMessages(req.body)) {
      const from = senderAddress(message);
      if (!from) continue;
      const lead = await prisma.crmLead.findFirst({
        where: { email: { equals: from, mode: 'insensitive' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (!lead) continue;
      const subject = String(message?.subject ?? message?.Subject ?? '(no subject)');
      const text = String(message?.text ?? message?.Text ?? message?.html ?? '').replace(/<[^>]*>/g, '').trim();
      await prisma.crmActivity.create({
        data: { leadId: lead.id, type: 'email_received', description: `Reply received: "${subject}".` },
      });
      await prisma.crmNote.create({
        data: {
          leadId: lead.id,
          userId: 'system',
          userName: 'Inbound email',
          body: `From: ${from}\nSubject: ${subject}\n\n${text.slice(0, 4000)}`,
        },
      });
    }
  } catch (err) {
    console.error('[inbound email] failed:', err);
  }
});

// ---------------------------------------------------------------------------
// Airphone telephony
// ---------------------------------------------------------------------------

function parseGlued(remainder: string): Record<string, string> {
  const glued: Record<string, string> = {};
  new URLSearchParams(remainder.replace(/^[?&]/, '')).forEach((value, key) => { glued[key] = value; });
  return glued;
}

async function telephonyGuard(rawToken: string): Promise<{ ok: boolean; enabled: boolean; glued: Record<string, string> }> {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, enabled: false, glued: {} };
  if (rawToken === settings.webhookToken) return { ok: true, enabled: true, glued: {} };
  if (rawToken.startsWith(settings.webhookToken)) {
    return { ok: true, enabled: true, glued: parseGlued(rawToken.slice(settings.webhookToken.length)) };
  }
  return { ok: false, enabled: true, glued: {} };
}

function pick(source: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = source[name] ?? source[name.toLowerCase()] ?? source[name.toUpperCase()];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return undefined;
}

async function handleAgentNumberWebhook(req: Request, res: Response, next: NextFunction) {
  const request = describeRequest(req as any);
  try {
    const guard = await telephonyGuard(String(req.params.token));
    if (!guard.ok) {
      const reason = guard.enabled
        ? 'The token in the webhook URL does not match the one in Settings -> Telephony.'
        : 'Telephony is turned off in Settings -> Telephony.';
      await logTelephonyEvent({ kind: 'routing', outcome: 'rejected', request, errorMessage: reason, response: { httpStatus: 403 } });
      return res.sendStatus(403);
    }
    const input = { ...guard.glued, ...(req.query as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) };
    const answer = await resolveAgentForCall({
      caller: pick(input, 'caller', 'caller_id', 'callerid', 'from', 'cli', 'mobile') ?? '',
      uniqueId: pick(input, 'unique_id', 'uniqueid', 'call_id', 'callid'),
      virtualNumber: pick(input, 'vnm', 'ivr_number', 'virtual_number', 'did', 'to'),
    });
    const body = answer ? { number: answer.number, requestId: answer.requestId } : { number: '', requestId: '' };
    await logTelephonyEvent({
      kind: 'routing',
      outcome: 'ok',
      request,
      response: body,
      errorMessage: answer ? undefined : 'No agent and no fallback number — answered with an empty number.',
      callLogId: answer?.callLogId ?? null,
    });
    res.json(body);
  } catch (err) {
    await logTelephonyEvent({
      kind: 'routing',
      outcome: 'failed',
      request,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}

webhookRouter.get('/airphone/:token', handleAgentNumberWebhook);
webhookRouter.post('/airphone/:token', handleAgentNumberWebhook);

webhookRouter.post('/airphone/:token/:tail', async (req, res, next) => {
  const tail = String(req.params.tail ?? '');
  if (!tail.startsWith('call-log')) return next();
  const request = describeRequest(req as any);
  const guard = await telephonyGuard(String(req.params.token));
  if (!guard.ok) {
    await logTelephonyEvent({
      kind: 'call_log',
      outcome: 'rejected',
      request,
      response: { httpStatus: 403 },
      errorMessage: guard.enabled
        ? 'The token in the webhook URL does not match the one in Settings -> Telephony.'
        : 'Telephony is turned off in Settings -> Telephony.',
    });
    return res.sendStatus(403);
  }
  res.json({ status: 'ok' });
  try {
    const result = await recordCallLog({
      ...guard.glued,
      ...parseGlued(tail.slice('call-log'.length)),
      ...((req.body ?? {}) as Record<string, unknown>),
    });
    await logTelephonyEvent({
      kind: 'call_log',
      outcome: 'ok',
      request,
      response: { status: 'ok', callLogId: result.id, created: result.created },
      callLogId: result.id,
    });
  } catch (err) {
    console.error('[airphone] call-log failed:', err, req.body);
    await logTelephonyEvent({
      kind: 'call_log',
      outcome: 'failed',
      request,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// Generic inbound receiver
// ---------------------------------------------------------------------------

webhookRouter.get('/:source/:token', async (req, res) => {
  const connection = await prisma.crmSourceConnection.findUnique({ where: { webhookToken: req.params.token } });
  if (!connection || connection.source !== req.params.source) {
    return res.status(404).json({ error: 'Unknown webhook endpoint.' });
  }
  res.json({ ok: true, connection: connection.name, source: connection.source, active: connection.active });
});

webhookRouter.post('/:source/:token', async (req, res) => {
  const { source, token } = req.params;
  if (source === 'meta') {
    return res.status(400).json({ error: 'Meta connections receive at /api/webhook/meta, which verifies the request signature.' });
  }
  const connection = await prisma.crmSourceConnection.findUnique({ where: { webhookToken: token } });
  if (!connection || connection.source !== source) {
    return res.status(404).json({ error: 'Unknown webhook endpoint.' });
  }
  const logRejection = (status: 'failed' | 'invalid_signature', errorMessage: string) =>
    prisma.crmIntegrationActivity.create({
      data: {
        connectionId: connection.id,
        source: connection.source,
        status,
        errorMessage,
        rawPayload: (req.body ?? {}) as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
  if (!connection.active) {
    await logRejection('failed', 'Connection is inactive — payload discarded.');
    return res.status(403).json({ error: 'This connection is inactive.' });
  }
  const storedSecret = (connection.credentials as Record<string, string> | null)?.webhook_secret;
  if (storedSecret) {
    const presented =
      (req.headers['x-webhook-secret'] as string | undefined) ??
      (req.body?.api_key as string | undefined) ??
      (req.body?.webhook_secret as string | undefined);
    if (!presented || presented !== decrypt(storedSecret)) {
      await logRejection('invalid_signature', 'Webhook secret did not match.');
      return res.status(401).json({ error: 'Invalid webhook secret.' });
    }
  }
  const result = await ingestWebhookLead({
    connection,
    payload: req.body,
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(200).json({
    ok: result.status !== 'failed',
    status: result.status,
    message: result.message,
    leadId: result.leadId,
    leadsCreated: result.leadsCreated,
  });
});
