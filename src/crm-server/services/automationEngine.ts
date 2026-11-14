import type { CrmAutomation, CrmAutomationStep, CrmLead } from '@prisma/client';
import { prisma } from '../prisma';
import { isWithinBusinessHours } from './businessHours';
import { enrollLead } from './aiSdrEngine';
import { deliverLeadEmail, renderPlaceholders } from './email';
import { runUnscoped } from './requestContext';

// ---------------------------------------------------------------------------
// The automation engine: trigger -> ordered steps (condition / action / delay), run
// top-to-bottom for one lead. A condition step halts the run (status 'skipped') the moment
// it fails; an action step runs immediately; a delay step pauses the run (status 'waiting',
// `resumeAt` set) for the background resumer below to pick back up. The legacy CRM drove that from an
// in-process setInterval; TaskBoard runs no timers inside the web process, so the resumer is one pass
// (`runAutomationTick`) invoked by the CRM tick (src/crm-server/tick.ts). It still survives a
// restart because the pause state lives in the database, not in memory.
//
// Every entry point below (`fireTrigger`, `runAutomationManually`, the resumer) swallows its
// own errors: an automation is a best-effort side effect and must never fail the request that
// triggered it (a lead-creation POST, a stage-change POST, ...).
// ---------------------------------------------------------------------------

type LeadWithRelations = CrmLead & {
  tags?: { tagId: string }[];
  stage?: { id: string; name: string } | null;
  pipeline?: { id: string; name: string } | null;
};

async function fetchLeadWithRelations(leadId: string): Promise<LeadWithRelations | null> {
  return prisma.crmLead.findUnique({
    where: { id: leadId },
    include: { tags: true, stage: true, pipeline: true },
  });
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

interface ConditionConfig {
  conditionType: string;
  fieldName?: string;
  value?: string;
  /** For conditions that match against a chosen set, such as the Meta ad forms. */
  values?: string[];
}

/** Resolves a handful of known dotted paths on top of any plain Lead column. */
function resolveFieldValue(lead: LeadWithRelations, fieldName: string): string {
  switch (fieldName) {
    case 'pipeline_stage.name':
      return lead.stage?.name ?? '';
    case 'pipeline.name':
      return lead.pipeline?.name ?? '';
    default:
      return String((lead as unknown as Record<string, unknown>)[fieldName] ?? '');
  }
}

/** Accepts a list, and falls back to the single value an older saved step may hold. */
function chosenValues(config: ConditionConfig): string[] {
  if (Array.isArray(config.values)) return config.values.filter(Boolean);
  return config.value ? [config.value] : [];
}

function evaluateCondition(config: ConditionConfig, lead: LeadWithRelations): { passed: boolean; reason: string } {
  const tagIds = (lead.tags ?? []).map((t) => t.tagId);
  const value = config.value ?? '';

  switch (config.conditionType) {
    case 'source_is':
      return { passed: lead.source.toLowerCase() === value.toLowerCase(), reason: `source is "${lead.source}"` };
    case 'source_is_not':
      return { passed: lead.source.toLowerCase() !== value.toLowerCase(), reason: `source is "${lead.source}"` };
    case 'ad_form_is':
    case 'ad_form_is_not': {
      // Meta's token here cannot read ad names, so the lead form's name is the finest
      // attribution available — and it is the same handle the Leads list filters on.
      const detail = lead.adDetail as { formName?: string | null } | null;
      const actual = detail?.formName ?? '';
      const wanted = chosenValues(config);
      const matched = actual !== '' && wanted.some((v) => v.toLowerCase() === actual.toLowerCase());
      const reason = actual ? `lead came from ad form "${actual}"` : 'lead has no ad form (not a Meta ad lead)';
      return { passed: config.conditionType === 'ad_form_is' ? matched : !matched, reason };
    }
    case 'has_tag':
      return { passed: tagIds.includes(value), reason: `lead has tags [${tagIds.join(', ')}]` };
    case 'not_has_tag':
      return { passed: !tagIds.includes(value), reason: `lead has tags [${tagIds.join(', ')}]` };
    case 'field_equals': {
      const actual = resolveFieldValue(lead, config.fieldName ?? '');
      return { passed: actual.toLowerCase() === value.toLowerCase(), reason: `${config.fieldName} = "${actual}"` };
    }
    case 'field_contains': {
      const actual = resolveFieldValue(lead, config.fieldName ?? '');
      return { passed: actual.toLowerCase().includes(value.toLowerCase()), reason: `${config.fieldName} = "${actual}"` };
    }
    case 'field_is_empty': {
      const actual = resolveFieldValue(lead, config.fieldName ?? '');
      return { passed: actual.trim() === '', reason: `${config.fieldName} = "${actual}"` };
    }
    case 'score_gt':
      return { passed: lead.leadScore > Number(value), reason: `score is ${lead.leadScore}` };
    case 'score_lt':
      return { passed: lead.leadScore < Number(value), reason: `score is ${lead.leadScore}` };
    case 'assigned_to':
      return { passed: lead.assignedUserId === value, reason: `assigned to "${lead.assignedUserId ?? 'nobody'}"` };
    case 'unassigned':
      return { passed: !lead.assignedUserId, reason: `assigned to "${lead.assignedUserId ?? 'nobody'}"` };
    default:
      return { passed: false, reason: `unknown condition type "${config.conditionType}"` };
  }
}

// ---------------------------------------------------------------------------
// Action execution — each returns whether the chain should continue, and a human-readable
// summary that lands in the run's `message` and, for most actions, a LeadActivity too.
// ---------------------------------------------------------------------------

interface ActionResult {
  ok: boolean;
  message: string;
}

interface ActionContext {
  automationName: string;
  /** Only ever populated for a manually-triggered run — see the note on 'team' mode below. */
  teamMemberIds?: string[];
  /**
   * Which step of which automation is running. A sequential rota needs somewhere to remember
   * whose turn it is, and the position is the only stable handle: saving an automation deletes
   * and recreates every step, so a marker kept against the step id would be thrown away — and
   * the rota would start again from the top — every time somebody edited the automation.
   */
  automationId?: string;
  stepIndex?: number;
}

export interface AssignSequenceEntry {
  userId: string;
  /** How many leads in a row this person takes before the rota moves on. */
  count: number;
}

/**
 * Deals one lead from a fixed rota — ten to the first person, ten to the next, and round
 * again — and moves the marker on.
 *
 * Different from `round_robin`, which picks whoever was assigned longest ago and needs no
 * memory. A rota does: it has to know whose turn it is and how far through their batch it is,
 * so the position is kept per step rather than inferred from history, which would guess wrong
 * the moment a lead was reassigned by hand.
 */
async function nextFromSequence(
  automationId: string,
  stepIndex: number,
  sequence: AssignSequenceEntry[]
): Promise<string | undefined> {
  const rota = sequence.filter((entry) => entry.userId && Number(entry.count) > 0);
  if (rota.length === 0) return undefined;

  const key = { automationId_stepIndex: { automationId, stepIndex } };
  const cursor = await prisma.crmAutomationCursor.upsert({
    where: key,
    update: {},
    create: { automationId, stepIndex },
  });

  // The rota may have been edited since the marker was last saved, so it is clamped rather
  // than trusted — an out-of-range position would otherwise stop the automation dead.
  let position = cursor.position >= 0 && cursor.position < rota.length ? cursor.position : 0;
  let dealt = cursor.dealt;
  if (dealt >= rota[position].count) {
    position = (position + 1) % rota.length;
    dealt = 0;
  }

  const chosen = rota[position].userId;

  dealt += 1;
  if (dealt >= rota[position].count) {
    position = (position + 1) % rota.length;
    dealt = 0;
  }
  await prisma.crmAutomationCursor.update({ where: key, data: { position, dealt } });

  return chosen;
}

async function logActivity(leadId: string, type: string, description: string, metadata?: unknown) {
  await prisma.crmActivity.create({ data: { leadId, type, description, metadata: metadata as any } });
}

async function actionAssignLead(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  const assignUserIds: string[] = config.assignUserIds ?? [];
  let toUserId: string | undefined;

  if (config.assignMode === 'specific') {
    toUserId = assignUserIds[0];
  } else if (config.assignMode === 'round_robin' && assignUserIds.length > 0) {
    // Whichever candidate was assigned longest ago (or never) goes next.
    let best = assignUserIds[0];
    let bestTime = Infinity;
    for (const candidate of assignUserIds) {
      const entry = await prisma.crmAssignmentHistoryEntry.findFirst({ where: { toUserId: candidate }, orderBy: { createdAt: 'desc' } });
      const t = entry ? entry.createdAt.getTime() : 0;
      if (t < bestTime) {
        bestTime = t;
        best = candidate;
      }
    }
    toUserId = best;
  } else if (config.assignMode === 'sequence') {
    if (!ctx.automationId || ctx.stepIndex === undefined) {
      return { ok: false, message: 'A sequential rota can only run as a saved automation step.' };
    }
    toUserId = await nextFromSequence(ctx.automationId, ctx.stepIndex, (config.assignSequence ?? []) as AssignSequenceEntry[]);
    if (!toUserId) {
      return { ok: false, message: 'The distribution order is empty — add at least one person with a lead count.' };
    }
  } else if (config.assignMode === 'team') {
    // In the legacy CRM, teams lived only in the frontend's mock layer, so only a manual run (which
    // sent the membership along) could resolve one. TaskBoard stores Teams, so a step that names a
    // `teamId` resolves its active members here and works from automatic triggers too. The
    // manual-run membership is still honoured for steps saved without a team id.
    let members = ctx.teamMemberIds ?? [];
    if (config.teamId) {
      const rows = await prisma.employee.findMany({
        where: { teamId: String(config.teamId), deletedAt: null, status: { in: ['ACTIVE', 'PROBATION'] } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      members = rows.map((r) => r.id);
    }
    if (members.length === 0) {
      return {
        ok: false,
        message: config.teamId
          ? 'The chosen team has no active members to assign to.'
          : 'Team-based assignment needs a team — pick one on this step.',
      };
    }
    // Whichever member was assigned longest ago (or never) goes next, so a team shares the load
    // instead of every lead landing on its first member.
    let best = members[0];
    let bestTime = Infinity;
    for (const candidate of members) {
      const entry = await prisma.crmAssignmentHistoryEntry.findFirst({ where: { toUserId: candidate }, orderBy: { createdAt: 'desc' } });
      const t = entry ? entry.createdAt.getTime() : 0;
      if (t < bestTime) {
        bestTime = t;
        best = candidate;
      }
    }
    toUserId = best;
  }

  if (!toUserId) return { ok: false, message: 'No eligible assignee was found for this rule.' };
  if (lead.assignedUserId && !config.overwrite) {
    return { ok: false, message: 'Lead already has an owner and the rule does not allow overwriting.' };
  }

  const fromUserId = lead.assignedUserId;
  await prisma.crmLead.update({ where: { id: lead.id }, data: { assignedUserId: toUserId } });
  await prisma.crmAssignmentHistoryEntry.create({ data: { leadId: lead.id, fromUserId, toUserId, actorName: `Automation: ${ctx.automationName}` } });
  await logActivity(lead.id, 'assigned', `Assigned by automation "${ctx.automationName}".`, { toUserId });
  return { ok: true, message: `Assigned to ${toUserId}.` };
}

async function actionAddTag(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  if (!config.tagId) return { ok: false, message: 'No tag configured.' };
  await prisma.crmTagOnLead.create({ data: { leadId: lead.id, tagId: config.tagId } }).catch(() => undefined);
  await logActivity(lead.id, 'tag_applied', `Tag applied by automation "${ctx.automationName}".`, { tagId: config.tagId });
  return { ok: true, message: `Tag ${config.tagId} applied.` };
}

async function actionRemoveTag(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  if (!config.tagId) return { ok: false, message: 'No tag configured.' };
  await prisma.crmTagOnLead.delete({ where: { leadId_tagId: { leadId: lead.id, tagId: config.tagId } } }).catch(() => undefined);
  await logActivity(lead.id, 'tag_removed', `Tag removed by automation "${ctx.automationName}".`, { tagId: config.tagId });
  return { ok: true, message: `Tag ${config.tagId} removed.` };
}

async function actionChangeStage(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  const toStage = config.stageId ? await prisma.crmPipelineStage.findUnique({ where: { id: config.stageId } }) : null;
  if (!toStage) return { ok: false, message: 'No stage configured, or the configured stage no longer exists.' };

  const data: Record<string, unknown> = { pipelineId: toStage.pipelineId, pipelineStageId: toStage.id, stageEnteredAt: new Date() };
  if (toStage.isWon) data.status = 'won';
  if (toStage.isLost) data.status = 'lost';

  await prisma.crmLead.update({ where: { id: lead.id }, data });
  await prisma.crmStageHistoryEntry.create({
    data: { leadId: lead.id, fromStageName: lead.stage?.name, toStageName: toStage.name, actorName: `Automation: ${ctx.automationName}` },
  });
  await logActivity(lead.id, 'stage_moved', `Moved to "${toStage.name}" by automation "${ctx.automationName}".`);
  return { ok: true, message: `Moved to stage "${toStage.name}".` };
}

const UPDATABLE_FIELDS = ['priority', 'status', 'notes'] as const;

async function actionUpdateField(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  if (!UPDATABLE_FIELDS.includes(config.field)) return { ok: false, message: `Field "${config.field}" cannot be set by an automation.` };
  await prisma.crmLead.update({ where: { id: lead.id }, data: { [config.field]: config.value } });
  await logActivity(lead.id, 'note_added', `${config.field} set to "${config.value}" by automation "${ctx.automationName}".`);
  return { ok: true, message: `${config.field} set to "${config.value}".` };
}

const MS_PER_UNIT: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

async function actionCreateFollowup(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  const offsetMs = (Number(config.dueInAmount) || 1) * (MS_PER_UNIT[config.dueInUnit] ?? MS_PER_UNIT.hours);
  const dueAt = new Date(Date.now() + offsetMs);
  await prisma.crmFollowUp.create({
    data: {
      leadId: lead.id,
      title: config.title || `Follow up (${ctx.automationName})`,
      description: config.description || undefined,
      dueAt,
      reminderAt: dueAt,
      priority: config.priority ?? 'normal',
      assignedUserId: config.assignedUserId || lead.assignedUserId || undefined,
    },
  });
  await logActivity(lead.id, 'note_added', `Follow-up task created by automation "${ctx.automationName}", due ${dueAt.toLocaleString('en-IN')}.`);
  return { ok: true, message: `Follow-up created, due ${dueAt.toISOString()}.` };
}

/** Delegates to the shared delivery seam (services/email.ts) so every CRM email is recorded
 * identically and there is one place to plug a provider into. */
async function actionSendEmail(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  return deliverLeadEmail(lead, {
    subject: renderPlaceholders(config.subject ?? '', lead),
    body: renderPlaceholders(config.body ?? '', lead),
    source: `Automation: ${ctx.automationName}`,
  });
}

async function actionEnrollInSdrAgent(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  if (!config.agentId) return { ok: false, message: 'No AI SDR agent configured on this step.' };
  const result = await enrollLead(config.agentId, lead.id);
  // "Already enrolled" isn't a failure worth halting the chain over — the lead is where it should be.
  if (!result.ok && result.message.includes('already enrolled')) return { ok: true, message: result.message };
  return result.ok
    ? { ok: true, message: `Enrolled with AI SDR agent (${ctx.automationName}): ${result.message}` }
    : { ok: false, message: result.message };
}

/**
 * the legacy CRM's email sequences (templates, multi-step drips) were deliberately not ported to TaskBoard.
 * An automation saved with this step must not look as if it enrolled anybody, so the step fails
 * honestly and the run records why. A "Send email" step or an AI SDR agent covers the same need.
 */
async function actionEnrollInSequence(): Promise<ActionResult> {
  return {
    ok: false,
    message: "Email sequences are not part of TaskBoard's CRM — this step did nothing. Replace it with a Send email or AI SDR step.",
  };
}

async function executeAction(config: any, lead: LeadWithRelations, ctx: ActionContext): Promise<ActionResult> {
  switch (config.action) {
    case 'assign_lead': return actionAssignLead(config, lead, ctx);
    case 'enroll_in_sdr_agent': return actionEnrollInSdrAgent(config, lead, ctx);
    case 'enroll_in_sequence': return actionEnrollInSequence();
    case 'add_tag': return actionAddTag(config, lead, ctx);
    case 'remove_tag': return actionRemoveTag(config, lead, ctx);
    case 'change_stage': return actionChangeStage(config, lead, ctx);
    case 'update_field': return actionUpdateField(config, lead, ctx);
    case 'create_followup': return actionCreateFollowup(config, lead, ctx);
    case 'send_email': return actionSendEmail(config, lead, ctx);
    default: return { ok: false, message: `Unknown action "${config.action}".` };
  }
}

// ---------------------------------------------------------------------------
// The run loop
// ---------------------------------------------------------------------------

interface RunOptions {
  teamMemberIds?: string[];
}

async function executeSteps(
  automation: Pick<CrmAutomation, 'id' | 'name'>,
  steps: CrmAutomationStep[],
  leadId: string,
  startIndex: number,
  existingRunId: string | undefined,
  options: RunOptions
): Promise<void> {
  const finish = async (status: string, message: string, nextStepIndex?: number, resumeAt?: Date) => {
    const data = { status, message, nextStepIndex: nextStepIndex ?? null, resumeAt: resumeAt ?? null, ranAt: new Date() };
    if (existingRunId) {
      await prisma.crmAutomationRun.update({ where: { id: existingRunId }, data });
    } else {
      await prisma.crmAutomationRun.create({ data: { automationId: automation.id, automationName: automation.name, leadId, ...data } });
    }
  };

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const lead = await fetchLeadWithRelations(leadId);
    if (!lead) return finish('failed', 'Lead no longer exists.');

    if (step.type === 'condition') {
      const { passed, reason } = evaluateCondition(step.config as unknown as ConditionConfig, lead);
      if (!passed) return finish('skipped', `Stopped at condition ${i + 1}: ${reason}.`);
    } else if (step.type === 'action') {
      const result = await executeAction(step.config, lead, {
        automationName: automation.name,
        teamMemberIds: options.teamMemberIds,
        automationId: automation.id,
        stepIndex: i,
      }).catch(
        (err) => ({ ok: false, message: err instanceof Error ? err.message : 'Action failed unexpectedly.' })
      );
      if (!result.ok) return finish('failed', `Action ${i + 1} failed: ${result.message}`);
    } else if (step.type === 'delay') {
      const config = step.config as { amount?: number; unit?: string };
      const ms = (Number(config.amount) || 1) * (MS_PER_UNIT[config.unit ?? 'hours'] ?? MS_PER_UNIT.hours);
      const resumeAt = new Date(Date.now() + ms);
      return finish('waiting', `Waiting until ${resumeAt.toLocaleString('en-IN')}.`, i + 1, resumeAt);
    }
  }
  return finish('success', 'Completed all steps.');
}

async function startRun(automation: CrmAutomation & { steps: CrmAutomationStep[] }, leadId: string, options: RunOptions = {}): Promise<void> {
  if (automation.respectBusinessHours && !(await isWithinBusinessHours())) {
    await prisma.crmAutomationRun.create({
      data: {
        automationId: automation.id,
        automationName: automation.name,
        leadId,
        status: 'skipped',
        message: 'Skipped — outside configured business hours.',
      },
    });
    return;
  }
  await executeSteps(automation, automation.steps, leadId, 0, undefined, options);
}

/** Every automatic trigger point in the app calls this. Never throws — a bad automation must
 * never break the request (lead creation, stage change, ...) that happened to fire it. */
export async function fireTrigger(
  triggerType: string,
  leadId: string,
  context: { fromStageId?: string; toStageId?: string; tagId?: string; formId?: string } = {}
): Promise<void> {
  // The engine acts as the system, not as whoever's request happened to fire it. Without this
  // a lead created by a team leader would be invisible to the engine's own lookups, because
  // the request it is running inside narrows every lead read to that person's hierarchy.
  return runUnscoped(async () => {
  try {
    const automations = await prisma.crmAutomation.findMany({
      where: { enabled: true, triggerType },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });

    for (const automation of automations) {
      const config = (automation.triggerConfig as Record<string, unknown> | null) ?? {};
      if (triggerType === 'lead_stage_changed') {
        if (config.fromStageId && config.fromStageId !== context.fromStageId) continue;
        if (config.toStageId && config.toStageId !== context.toStageId) continue;
      }
      if (triggerType === 'tag_added' && config.tagId && config.tagId !== context.tagId) continue;
      if (triggerType === 'form_submitted' && config.formId && config.formId !== context.formId) continue;

      await startRun(automation, leadId).catch((err) => console.error(`[automation ${automation.name}] run failed:`, err));
    }
  } catch (err) {
    console.error(`[automation engine] fireTrigger(${triggerType}) failed:`, err);
  }
  });
}

/** Manual runs still originate from the frontend's explicit "Run automation" action — kept
 * separate from `fireTrigger` because only this path can carry `teamMemberIds`. */
export async function runAutomationManually(automationId: string, leadIds: string[], teamMemberIds?: string[]): Promise<{ queued: number; skipped: number }> {
  // Same reason as fireTrigger: the caller has already decided which leads they may run this
  // on, and from here the engine works as the system.
  return runUnscoped(async () => {
  const automation = await prisma.crmAutomation.findUnique({ where: { id: automationId }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
  if (!automation) return { queued: 0, skipped: leadIds.length };

  let queued = 0;
  let skipped = 0;
  for (const leadId of leadIds) {
    const before = await prisma.crmAutomationRun.count({ where: { automationId, leadId } });
    await startRun(automation, leadId, { teamMemberIds });
    const after = await prisma.crmAutomationRun.findFirst({ where: { automationId, leadId }, orderBy: { ranAt: 'desc' } });
    if (after?.status === 'success' || after?.status === 'waiting') queued += 1;
    else skipped += 1;
    void before;
  }
  return { queued, skipped };
  });
}

// ---------------------------------------------------------------------------
// Background resumer — picks up any run paused on a delay step whose time has come, and any
// "no_activity" automation whose stale leads haven't been checked yet. The legacy CRM started these
// on a setInterval from index.ts; in TaskBoard `runAutomationTick` is ONE pass, called by the CRM
// tick (src/crm-server/tick.ts, POST /api/cron/crm-tick).
// ---------------------------------------------------------------------------

/** A claimed run that has not finished in this long was interrupted (a crash, a deploy). */
const STALE_RUNNING_MS = 15 * 60_000;

async function resumeDueDelays(): Promise<{ due: number; resumed: number; failed: number; interrupted: number }> {
  // Runs claimed by a pass that never finished are reported, not silently retried: the step
  // they were on may already have had its side effect (an email sent, a lead reassigned).
  const interrupted = await prisma.crmAutomationRun.updateMany({
    where: { status: 'running', updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    data: { status: 'failed', message: 'Interrupted while resuming after a delay — check the lead and re-run if needed.', resumeAt: null },
  });

  const due = await prisma.crmAutomationRun.findMany({
    where: { status: 'waiting', resumeAt: { lte: new Date() } },
    orderBy: { resumeAt: 'asc' },
    take: 50,
  });
  let resumed = 0;
  let failed = 0;
  for (const run of due) {
    // Claimed before it runs: a tick that overlaps the previous one (a slow pass, or a second
    // server) must not execute the same delayed step twice. Only one updateMany can win.
    // `running` lives only for the length of this pass; executeSteps overwrites it.
    const claim = await prisma.crmAutomationRun.updateMany({
      where: { id: run.id, status: 'waiting' },
      data: { status: 'running' },
    });
    if (claim.count === 0) continue;

    // The automation cannot be missing here — deleting one cascades to its runs.
    const automation = await prisma.crmAutomation.findUniqueOrThrow({
      where: { id: run.automationId },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    // Deliberate: disabling an automation only stops it from starting on NEW triggers — a run
    // already mid-flight on a delay step is allowed to finish, the same way Zapier/HubSpot
    // workflows treat an in-progress run when the workflow is turned off underneath it.
    try {
      await executeSteps(automation, automation.steps, run.leadId, run.nextStepIndex ?? 0, run.id, {});
      resumed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[crm] automation "${automation.name}" resume failed:`, err);
      await prisma.crmAutomationRun
        .update({
          where: { id: run.id },
          data: {
            status: 'failed',
            message: err instanceof Error ? err.message : 'Resume failed unexpectedly.',
            resumeAt: null,
            ranAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }
  return { due: due.length, resumed, failed, interrupted: interrupted.count };
}

async function checkNoActivityAutomations(): Promise<{ automations: number; started: number; failed: number }> {
  const automations = await prisma.crmAutomation.findMany({
    where: { enabled: true, triggerType: 'no_activity' },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  let started = 0;
  let failed = 0;
  for (const automation of automations) {
    const days = Number((automation.triggerConfig as Record<string, unknown> | null)?.days) || 3;
    const staleBefore = new Date(Date.now() - days * MS_PER_UNIT.days);

    // Leads with no activity newer than the threshold, and not already fired for this
    // automation (it fires at most once per lead). The legacy CRM filtered both in memory after a
    // take of 200, so once the first 200 stale leads had fired, nobody after them ever did;
    // both conditions are in the query here so each pass reaches the next unfired leads.
    const fired = await prisma.crmAutomationRun.findMany({
      where: { automationId: automation.id },
      select: { leadId: true },
      distinct: ['leadId'],
    });
    const candidates = await prisma.crmLead.findMany({
      where: {
        createdAt: { lte: staleBefore },
        status: { notIn: ['won', 'lost'] },
        activities: { none: { createdAt: { gt: staleBefore } } },
        ...(fired.length ? { id: { notIn: fired.map((r) => r.leadId) } } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    for (const lead of candidates) {

      try {
        await startRun(automation, lead.id);
        started += 1;
      } catch (err) {
        failed += 1;
        console.error(`[crm] automation "${automation.name}" no_activity run failed:`, err);
      }
    }
  }
  return { automations: automations.length, started, failed };
}

/** One pass of the automation engine's background work, as the system (no data scope). */
export async function runAutomationTick(): Promise<{
  delays: Awaited<ReturnType<typeof resumeDueDelays>>;
  noActivity: Awaited<ReturnType<typeof checkNoActivityAutomations>>;
}> {
  return runUnscoped(async () => {
    const delays = await resumeDueDelays();
    const noActivity = await checkNoActivityAutomations();
    return { delays, noActivity };
  });
}
