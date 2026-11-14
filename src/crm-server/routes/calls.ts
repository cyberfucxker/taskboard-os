import { Router } from '../express';
import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { ownerScope } from '../services/hierarchy';
import { parseListQuery } from '../services/list';
import { encrypt } from '../services/crypto';
import { writeAudit } from '../services/audit';
import type { AuthedRequest } from '../services/auth';
import { clickToCall, dialCall, getExtensionStatus, getSettings, normalizeNumber, testConnection, TelephonyError, type ClickToCallResult } from '../services/airphone';
import { ACTIVE_EMPLOYEE_STATUSES, AGENT_SELECT, callableEmployeeWhere } from '../services/callRouting';
import { CRM_API_BASE } from '../config';

export const callsRouter = Router();

const callInclude = {
  lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
  agentUser: { select: { id: true, name: true } },
} satisfies Prisma.CrmCallLogInclude;

type CallRow = Prisma.CrmCallLogGetPayload<{ include: typeof callInclude }>;

function serialize(call: CallRow) {
  return {
    id: call.id,
    uniqueId: call.uniqueId ?? undefined,
    requestId: call.requestId,
    direction: call.direction,
    status: call.status,
    callerNumber: call.callerNumber,
    agentNumber: call.agentNumber ?? undefined,
    virtualNumber: call.virtualNumber ?? undefined,
    leadId: call.leadId ?? undefined,
    leadName: call.lead ? `${call.lead.firstName} ${call.lead.lastName}`.trim() : undefined,
    agentUserId: call.agentUserId ?? undefined,
    agentName: call.agentUser?.name,
    durationSeconds: call.durationSeconds,
    recordingUrl: call.recordingUrl ?? undefined,
    recordingDurationSeconds: call.recordingDurationSeconds,
    dtmf: call.dtmf ?? undefined,
    feedback: call.feedback ?? undefined,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString(),
  };
}

function handleTelephonyError(err: unknown, res: any, next: (e?: unknown) => void) {
  if (err instanceof TelephonyError) return res.status(err.httpStatus).json({ error: err.message });
  // An axios failure means the provider is unreachable or rejected us — a 502, not a crash.
  if (axios.isAxiosError(err)) {
    return res.status(502).json({
      error: `Telephony provider error: ${err.response?.status ?? ''} ${err.message}`.trim(),
      providerResponse: err.response?.data,
    });
  }
  return next(err);
}

// ---------------------------------------------------------------------------
// Call history
// ---------------------------------------------------------------------------

callsRouter.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const query = parseListQuery(req, 20);
    const direction = String(req.query.direction ?? 'all');
    const status = String(req.query.status ?? 'all');
    const agentUserId = String(req.query.agentUserId ?? 'all');

    // A call is visible through the lead it belongs to, or through the agent who took it —
    // a team leader should see their own team's calls even on a lead nobody linked.
    const scope = req.scope;
    const where: Prisma.CrmCallLogWhereInput = {};
    if (scope && !scope.isAll) {
      where.OR = [{ lead: ownerScope(scope) }, { agentUserId: { in: scope.userIds } }];
    }
    if (direction !== 'all' && direction) where.direction = direction;
    if (status !== 'all' && status) where.status = status;
    if (agentUserId !== 'all' && agentUserId) where.agentUserId = agentUserId;
    if (query.search) {
      const searchOr: Prisma.CrmCallLogWhereInput[] = [
        { callerNumber: { contains: query.search } },
        { agentNumber: { contains: query.search } },
        { virtualNumber: { contains: query.search } },
        { lead: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { lead: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { agentUser: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
      // AND, not another OR: search narrows what the hierarchy already allows.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    const SORTABLE: Record<string, Prisma.CrmCallLogOrderByWithRelationInput> = {
      startedAt: { startedAt: query.sortDir },
      durationSeconds: { durationSeconds: query.sortDir },
    };
    const orderBy = (query.sortBy && SORTABLE[query.sortBy]) || { startedAt: 'desc' as const };

    const [items, total] = await Promise.all([
      prisma.crmCallLog.findMany({ where, include: callInclude, orderBy, skip: query.skip, take: query.take }),
      prisma.crmCallLog.count({ where }),
    ]);

    res.json({ items: items.map(serialize), total, page: query.page, pageSize: query.pageSize });
  } catch (err) {
    next(err);
  }
});

callsRouter.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const scope = req.scope;
    const call = await prisma.crmCallLog.findFirst({
      where: {
        id: String(req.params.id),
        ...(scope && !scope.isAll
          ? { OR: [{ lead: ownerScope(scope) }, { agentUserId: { in: scope.userIds } }] }
          : {}),
      },
      include: callInclude,
    });
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json({ ...serialize(call), rawPayload: call.rawPayload ?? undefined });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Placing calls
// ---------------------------------------------------------------------------

/**
 * Click-to-call. The provider rings the agent first, then the customer; we record the call
 * immediately so it appears in the history even if the provider's log never arrives.
 */
/**
 * Does the provider's refusal mean "I don't know that agent", as opposed to anything else?
 *
 * Only that answer is worth retrying with the person's other number. A busy line, a bad
 * customer number or an expired token would fail the same way whichever agent we named, and
 * retrying would just place the failure twice.
 */
function looksLikeUnknownAgent(message: string): boolean {
  return /agent (does not exist|not found)|invalid agent|unknown agent/i.test(message);
}

/**
 * The provider's message, plus what we actually tried.
 *
 * "Agent does not exist" on its own sends whoever reads it hunting, because it never says
 * which number was not recognised. Naming them turns it into something the office can act on
 * in the Airphone portal without asking anybody.
 */
function unknownAgentMessage(message: string, tried: string[], name?: string): string {
  if (!looksLikeUnknownAgent(message)) return message;
  return (
    `${message} Airphone does not recognise ${tried.join(' or ')} as an agent` +
    `${name ? ` for ${name}` : ''}. Register the number in the Airphone portal, or correct it ` +
    `under CRM Settings → Telephony.`
  );
}

callsRouter.post('/click-to-call', async (req: AuthedRequest, res, next) => {
  try {
    const leadId = req.body?.leadId ? String(req.body.leadId) : null;
    const lead = leadId ? await prisma.crmLead.findUnique({ where: { id: leadId }, select: { id: true, phone: true } }) : null;
    const caller = normalizeNumber(req.body?.caller ?? lead?.phone);
    if (caller.length < 10) return res.status(400).json({ error: 'A valid 10-digit customer number is required.' });

    const actor = req.auth ? await prisma.employee.findUnique({ where: { id: req.auth.sub }, select: AGENT_SELECT }) : null;
    const settings = await getSettings();

    // Whoever pressed the button is the agent — but WHICH of their numbers the provider knows
    // them by is not something this side can decide. Both have been tried as the single
    // answer and both were wrong for somebody:
    //
    //   extension only — rejected with "Invalid agent!" for whoever was provisioned by mobile
    //   mobile only    — rejected with "Agent does not exist" for whoever was provisioned by
    //                    extension, which on this account is most people with one
    //
    // So both are offered, in turn. The extension goes first because it is the provider's own
    // identifier for a person and is the one more of these agents are registered under; the
    // mobile follows for the handful who are set up the other way. An explicit `agent` in the
    // body still wins outright — that is somebody saying exactly who to ring.
    const candidates = [
      normalizeNumber(req.body?.agent),
      normalizeNumber(actor?.telephonyExtension),
      normalizeNumber(actor?.personalPhone),
    ].filter((n, i, all) => n && all.indexOf(n) === i);

    if (candidates.length === 0) {
      return res.status(400).json({
        error: `${actor?.name ?? 'This account'} has no calling extension or phone number saved, so there is nowhere to ring. Add one in Settings → Telephony.`,
      });
    }

    // The account decides which outbound endpoint is available; `mode` in the body is only for
    // overriding the configured default on a single call.
    const mode = String(req.body?.mode || settings.outboundMode || 'c2c');

    if (mode === 'dial-call') {
      let result = { ok: false, message: '' };
      let agent = candidates[0];
      for (const candidate of candidates) {
        agent = candidate;
        result = await dialCall({ agent: candidate, caller });
        if (result.ok || !looksLikeUnknownAgent(result.message)) break;
      }
      if (!result.ok) {
        return res.status(400).json({ error: unknownAgentMessage(result.message, candidates, actor?.name) });
      }

      // dial-call queues the call for the agent's Airphone *app*; nothing rings until that app
      // picks it up. A row is written anyway so the attempt is visible in the history rather
      // than vanishing, and the call-log webhook completes it if the call happens.
      const queued = await prisma.crmCallLog.create({
        data: {
          requestId: `dial-${Date.now()}`,
          direction: 'outgoing',
          status: 'routing',
          callerNumber: caller,
          agentNumber: agent,
          virtualNumber: settings.virtualNumber,
          leadId: lead?.id ?? null,
          agentUserId: actor?.id ?? null,
        },
        include: callInclude,
      });

      return res.json({
        status: 'success',
        message: `${result.message} This rings the Airphone app — it has to be open and signed in as ${actor?.name ?? 'this agent'}.`,
        call: serialize(queued),
      });
    }

    let result: ClickToCallResult = { status: 'error', message: '' };
    let agent = candidates[0];
    for (const candidate of candidates) {
      agent = candidate;
      result = await clickToCall({ agent: candidate, caller });
      // Only an "we don't know this agent" answer is worth retrying with the other number.
      // A busy line or a bad customer number would fail identically on both.
      if (result.status === 'success' || !looksLikeUnknownAgent(result.message)) break;
    }
    if (result.status !== 'success') {
      return res.status(400).json({ error: unknownAgentMessage(result.message, candidates, actor?.name) });
    }

    const created = await prisma.crmCallLog.create({
      data: {
        requestId: result.uniqueId ?? `c2c-${Date.now()}`,
        uniqueId: result.uniqueId ?? null,
        direction: 'outgoing',
        status: 'routing',
        callerNumber: caller,
        agentNumber: agent,
        virtualNumber: settings.virtualNumber,
        leadId: lead?.id ?? null,
        agentUserId: actor?.id ?? null,
      },
      include: callInclude,
    });

    res.status(201).json({ status: 'success', message: result.message, call: serialize(created) });
  } catch (err) {
    handleTelephonyError(err, res, next);
  }
});

// ---------------------------------------------------------------------------
// Live extension status
// ---------------------------------------------------------------------------

/** Reads live state for every staff member who has an extension mapped. */
callsRouter.get('/extensions/status', async (_req, res, next) => {
  try {
    const users = await prisma.employee.findMany({
      where: { deletedAt: null, status: { in: [...ACTIVE_EMPLOYEE_STATUSES] }, telephonyExtension: { not: null } },
      select: { id: true, name: true, telephonyExtension: true },
      orderBy: { name: 'asc' },
    });
    if (users.length === 0) return res.json({ extensions: [] });

    const statuses = await getExtensionStatus(users.map((u) => u.telephonyExtension!));
    const byResource = new Map(statuses.map((s) => [String(s.resource), s]));
    res.json({
      extensions: users.map((u) => {
        const live = byResource.get(String(u.telephonyExtension));
        return {
          userId: u.id,
          userName: u.name,
          extension: u.telephonyExtension,
          state: live?.state ?? 'unknown',
          onCall: live?.on_call ?? false,
        };
      }),
    });
  } catch (err) {
    handleTelephonyError(err, res, next);
  }
});

// ---------------------------------------------------------------------------
// Agent extension mapping
//
// The provider identifies whoever took a call by extension (`received_id` = 9121), never by
// mobile number, so without this mapping every row in the call history has an empty Agent
// column. Kept here rather than on the user screens because it is telephony configuration,
// and because setting one also repairs the calls already logged against that extension.
// ---------------------------------------------------------------------------

callsRouter.get('/extensions/mapping', async (_req, res, next) => {
  try {
    const users = await prisma.employee.findMany({
      where: callableEmployeeWhere(),
      select: { ...AGENT_SELECT, role: true },
      orderBy: [{ telephonyExtension: 'asc' }, { name: 'asc' }],
    });

    // How many logged calls each extension accounts for, so an unmapped busy extension is
    // obvious on the screen rather than something to go looking for.
    const counts = await prisma.crmCallLog.groupBy({
      by: ['agentNumber'],
      _count: { _all: true },
    });
    const byNumber = new Map(counts.map((c) => [String(c.agentNumber ?? ''), c._count._all]));

    res.json({
      users: users.map((u) => ({
        userId: u.id,
        name: u.name,
        phone: u.personalPhone ?? '',
        role: u.role,
        extension: u.telephonyExtension ?? '',
        callCount: u.telephonyExtension ? byNumber.get(u.telephonyExtension) ?? 0 : 0,
      })),
      unmapped: counts
        .filter((c) => c.agentNumber && !users.some((u) => u.telephonyExtension === c.agentNumber))
        .map((c) => ({ agentNumber: String(c.agentNumber), callCount: c._count._all }))
        .sort((a, b) => b.callCount - a.callCount),
    });
  } catch (err) {
    next(err);
  }
});

callsRouter.patch('/extensions/mapping', async (req: AuthedRequest, res, next) => {
  try {
    const userId = String(req.body?.userId ?? '');
    const extension = String(req.body?.extension ?? '').trim();
    if (!userId) return res.status(400).json({ error: 'A user is required.' });

    const user = await prisma.employee.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });

    if (extension) {
      const clash = await prisma.employee.findFirst({
        where: { telephonyExtension: extension, id: { not: userId }, deletedAt: null },
        select: { name: true },
      });
      if (clash) return res.status(409).json({ error: `Extension ${extension} is already mapped to ${clash.name}.` });
    }

    await prisma.employee.update({
      where: { id: userId },
      data: { telephonyExtension: extension || null },
    });

    // Calls already logged against this extension were left with no agent because nobody
    // owned it at the time. Claim them now, and release any this user no longer owns.
    const [released, claimed] = await Promise.all([
      prisma.crmCallLog.updateMany({
        where: { agentUserId: userId, ...(extension ? { agentNumber: { not: extension } } : {}) },
        data: { agentUserId: null },
      }),
      extension
        ? prisma.crmCallLog.updateMany({ where: { agentNumber: extension }, data: { agentUserId: userId } })
        : Promise.resolve({ count: 0 }),
    ]);

    await writeAudit(req, {
      module: 'Settings',
      action: extension ? `Mapped extension ${extension}` : 'Cleared telephony extension',
      recordId: userId,
      recordLabel: user.name,
    });

    res.json({ userId, extension, callsLinked: claimed.count, callsReleased: released.count });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function publicSettings(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    provider: settings.provider,
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    // Never returned. The UI shows whether one is stored and lets it be replaced.
    hasApiToken: !!settings.apiToken,
    virtualNumber: settings.virtualNumber ?? '',
    fallbackNumber: settings.fallbackNumber ?? '',
    stickyRouting: settings.stickyRouting,
    outboundMode: settings.outboundMode,
    testRouteNumber: settings.testRouteNumber ?? '',
    agentNumberWebhookUrl: `${CRM_API_BASE}/webhook/airphone/${settings.webhookToken}`,
    callLogWebhookUrl: `${CRM_API_BASE}/webhook/airphone/${settings.webhookToken}/call-log`,
  };
}

/**
 * Read-only probe of the provider, for use before a live call. Separate from the settings
 * PATCH so it can be run repeatedly while numbers are being sorted out.
 */
callsRouter.post('/settings/telephony/test', async (_req, res, next) => {
  try {
    res.json(await testConnection());
  } catch (err) {
    handleTelephonyError(err, res, next);
  }
});

/**
 * The provider's own requests, newest first — what arrived, under which parameter names, and
 * what we answered. The one screen worth watching during a live test call.
 */
callsRouter.get('/settings/telephony/events', async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.limit) || 25, 100);
    const events = await prisma.crmTelephonyEvent.findMany({ orderBy: { receivedAt: 'desc' }, take });
    res.json({
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        outcome: e.outcome,
        request: e.request ?? undefined,
        response: e.response ?? undefined,
        errorMessage: e.errorMessage ?? undefined,
        callLogId: e.callLogId ?? undefined,
        receivedAt: e.receivedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

callsRouter.get('/settings/telephony', async (_req, res, next) => {
  try {
    res.json(publicSettings(await getSettings()));
  } catch (err) {
    next(err);
  }
});

callsRouter.patch('/settings/telephony', async (req: AuthedRequest, res, next) => {
  try {
    await getSettings();
    const body = req.body ?? {};
    const data: Prisma.CrmTelephonySettingsUncheckedUpdateInput = {};
    if (body.enabled !== undefined) data.enabled = !!body.enabled;
    if (body.baseUrl !== undefined) data.baseUrl = String(body.baseUrl).trim().replace(/\/+$/, '');
    if (body.virtualNumber !== undefined) data.virtualNumber = normalizeNumber(body.virtualNumber) || null;
    if (body.fallbackNumber !== undefined) data.fallbackNumber = normalizeNumber(body.fallbackNumber) || null;
    if (body.stickyRouting !== undefined) data.stickyRouting = !!body.stickyRouting;
    if (body.outboundMode !== undefined) {
      data.outboundMode = String(body.outboundMode) === 'dial-call' ? 'dial-call' : 'c2c';
    }
    if (body.testRouteNumber !== undefined) data.testRouteNumber = normalizeNumber(body.testRouteNumber) || null;
    // A blank token means "leave the stored one alone" — the UI never sees it to send it back.
    if (body.apiToken) data.apiToken = encrypt(String(body.apiToken).trim());

    const updated = await prisma.crmTelephonySettings.update({ where: { id: 'default' }, data });
    await writeAudit(req, {
      module: 'Settings',
      action: 'Updated telephony settings',
      recordId: 'default',
      recordLabel: 'Telephony',
    });
    res.json(publicSettings(updated));
  } catch (err) {
    next(err);
  }
});

/** Rotating invalidates the URLs already given to the provider — deliberately explicit. */
callsRouter.post('/settings/telephony/rotate-webhook', async (req: AuthedRequest, res, next) => {
  try {
    await getSettings();
    const crypto = await import('crypto');
    const updated = await prisma.crmTelephonySettings.update({
      where: { id: 'default' },
      data: { webhookToken: crypto.randomBytes(18).toString('hex') },
    });
    await writeAudit(req, {
      module: 'Settings',
      action: 'Rotated telephony webhook URL',
      recordId: 'default',
      recordLabel: 'Telephony',
    });
    res.json(publicSettings(updated));
  } catch (err) {
    next(err);
  }
});
