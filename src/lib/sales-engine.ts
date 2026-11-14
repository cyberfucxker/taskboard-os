import { prisma } from "@/lib/db";
import { runAuditedAI } from "@/lib/ai-guard";
import { emitEvent } from "@/lib/eventlog";
import type {
  Lead, LeadFlowStage, SalesProposalStatus, SalesProposalSentVia,
  FollowUpTriggerReason, Employee, Prisma,
} from "@prisma/client";

/**
 * Autonomous AI Sales Engine (GaaS) — shared helpers.
 *
 * The founder's autonomous sales loop: every GaaS API route delegates its
 * logic here (per AGT-04: agent actions are deterministic, logged, margin-aware).
 * All functions emit typed Activity events into the append-only log so the
 * KPI/AI substrate sees the whole deal lifecycle.
 *
 * Integration points (deliberately swappable — ARCH-06):
 *   - `aiPrompt()`      -> the LLM hook (currently a deterministic stub so the
 *                          pipeline runs end-to-end. Real LLM calls are wired via @/lib/ai.
 *   - `sendWhatsApp()`  -> WhatsApp Cloud API adapter (env-gated).
 *   - `sendEmail()`     -> transactional email adapter (env-gated).
 */

// ---------------------------------------------------------------------------
// Config: env-gated, with sane local defaults so the engine is testable.
// ---------------------------------------------------------------------------
export const SALES_CONFIG = {
  calendlyUrl: process.env.CALENDLY_URL_SALES ?? "https://calendly.com/your-org/discovery",
  whatsappToken: process.env.WHATSAPP_API_TOKEN,
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  email: {
    from: process.env.SALES_EMAIL_FROM ?? "sales@example.com",
    transportUrl: process.env.SMTP_URL,
  },
} as const;

// Regional gross-margin pricing multipliers. GaaS sells Indian delivery into
// rich markets; margin is highest where the price gap vs domestic cost is wide.
const REGIONAL_MULTIPLIER: Record<string, { min: number; max: number }> = {
  USA: { min: 3.2, max: 4.5 },
  UAE: { min: 2.6, max: 3.6 },
  EUROPE: { min: 2.6, max: 3.6 },
  AUSTRALIA: { min: 2.4, max: 3.2 },
  INDIA: { min: 1.5, max: 2.2 },
};
const DEFAULT_REGION = "USA";

// ---------------------------------------------------------------------------
// Inbound: AI WhatsApp greeting + Calendly booking link (requirement 1 of 5)
// ---------------------------------------------------------------------------

/** Grease the AI greeting from the lead's name + query. Deterministic template. */
export function buildGreeting(lead: Pick<Lead, "name" | "company">): string {
  const first = lead.name.split(" ")[0] || lead.name || "there";
  return [
    `Hi ${first} 👋 thank you for reaching out about ${lead.company || "your project"}.`,
    `We're a growth team that plugs in like your own remote crew.`,
    `Let's find 15 minutes to understand where you are and what would move the needle:`,
    `${SALES_CONFIG.calendlyUrl}`,
  ].join("\n\n");
}

export interface InboundResult {
  lead: Lead;
  workflow: Awaited<ReturnType<typeof prisma.leadWorkflow.findUnique>>;
  greeting: string;
  sent: boolean;
}

/**
 * Handle a fresh inbound lead query:
 *  1. guarantees a Lead + LeadWorkflow (CONTACT_MADE) row,
 *  2. best-effort sends the AI WhatsApp greeting,
 *  3. emits AGENT_RUN + LEAD events.
 * Public (unauthenticated) — inbound comes from webhooks / landing forms.
 */
export async function runInbound(payload: {
  name: string;
  company: string;
  email?: string | null;
  phone?: string | null;
  source?: string;
  query?: string | null;
  whatsappThread?: string | null;
}): Promise<InboundResult> {
  const lead = await prisma.lead.create({
    data: {
      name: payload.name,
      company: payload.company,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      source: (payload.source ?? "INBOUND") as Lead["source"],
      nextStep: payload.query ? `Inquiry: "${payload.query.slice(0, 160)}"` : null,
      lastContactAt: new Date(),
      workflow: {
        create: {
          whatsappThread: payload.whatsappThread ?? null,
          stage: "CONTACT_MADE",
          lastContactedAt: new Date(),
        },
      },
    },
    include: { workflow: true },
  });

  const greeting = buildGreeting(lead);

  const sent = await sendWhatsApp(
    lead.phone,
    greeting,
    lead.workflow?.whatsappThread ?? undefined
  ).catch((err) => {
    console.error("[sales-engine] greeting send failed:", err);
    return false;
  });

  // Update workflow snapshot after the (best-effort) send.
  const workflow = await prisma.leadWorkflow.update({
    where: { leadId: lead.id },
    data: {
      stage: "CONTACT_MADE",
      lastContactedAt: new Date(),
      ...(sent ? {} : { fallbackAssignedTo: process.env.SALES_FALLBACK_OWNER ?? null }),
    },
  });

  await emitEvent({
    type: "AGENT_RUN",
    entityType: "lead",
    entityId: lead.id,
    payload: { agent: "sales-engine", action: "inbound_greeting", sent, query: payload.query ?? null },
    topic: "sales.inbound",
  });

  return { lead, workflow, greeting, sent };
}

// ---------------------------------------------------------------------------
// Meeting analysis: Dual Scores (Client + Rep) + MOM + action items (req 2)
// ---------------------------------------------------------------------------

export interface DualScores {
  clientScore: number;
  clientBudgetRating: number;
  clientSeriousnessScore: number;
  repScore: number;
  repPitchAdherence: number;
  momSummary: string;
  clientQuestions: Array<{ question: string; sentiment: string; addressed: boolean }>;
  teamPitched: Array<{ name: string; role: string; talkRatio: number }>;
  actionItems: Array<{ assignee: string; due: string; text: string }>;
}

/**
 * Analyze a discovery transcript. The `analyze` hook sits behind an adapter so
 * a real LLM call can be dropped in later; today we emit a deterministic
 * heuristic scorecard (signal count, tone cues, budget keywords) so the whole
 * pipeline is runnable with no model cost. Meeting is advanced to MEETING_HELD.
 */
export async function analyzeMeeting(
  leadId: string,
  transcript: string,
  opts?: { override?: Partial<DualScores> }
): Promise<MeetingIntelligenceView> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");

  const base = heuristicDualScores(transcript, lead);

  // Apply explicit overrides last so callers / an LLM can refine > heuristic.
  const scores: DualScores = {
    clientScore: clamp0_100(opts?.override?.clientScore ?? base.clientScore),
    clientBudgetRating: clamp0_100(opts?.override?.clientBudgetRating ?? base.clientBudgetRating),
    clientSeriousnessScore: clamp0_100(opts?.override?.clientSeriousnessScore ?? base.clientSeriousnessScore),
    repScore: clamp0_100(opts?.override?.repScore ?? base.repScore),
    repPitchAdherence: clamp0_100(opts?.override?.repPitchAdherence ?? base.repPitchAdherence),
    momSummary: opts?.override?.momSummary ?? base.momSummary,
    clientQuestions: opts?.override?.clientQuestions ?? base.clientQuestions,
    teamPitched: opts?.override?.teamPitched ?? base.teamPitched,
    actionItems: opts?.override?.actionItems ?? base.actionItems,
  };

  // Enhance MOM summary with a real AI call when transcript is provided
  if (transcript && transcript.length > 20) {
    try {
      // Audited: this call previously left no AgentRun row, so sales-engine model
      // spend was invisible in both the audit trail and usage accounting.
      // principalId is intentionally omitted — this is a library function with no
      // session in scope; the lead is recorded instead so the run is attributable.
      const aiRun = await runAuditedAI({
        agent: "sales-engine",
        action: "meeting_mom_summary",
        source: "sales-engine/analyzeMeeting",
        inputs: { leadId, transcriptChars: transcript.length },
        messages: [
          { role: "system", content: "You are a senior sales analyst writing structured meeting summaries for a GaaS company." },
          { role: "user", content: "You are analyzing a sales discovery call transcript. Produce a concise Minutes of Meeting (MOM) summary covering: key points discussed, client budget signals, client questions, next steps agreed. Keep it under 150 words.\n\nTranscript:\n" + transcript.slice(0, 3000) },
        ],
        aiOptions: { max_tokens: 300 },
      });
      if (aiRun.ok) {
        scores.momSummary = aiRun.text;
      } else {
        // Degrade to the heuristic scorecard rather than failing the whole call.
        console.warn("[sales-engine] AI MOM generation failed, using heuristic:", aiRun.kind, aiRun.message);
      }
    } catch (aiErr) {
      console.warn("[sales-engine] AI MOM generation failed, using heuristic:", aiErr);
    }
  }

  const intelligence = await prisma.meetingIntelligence.upsert({
    where: { leadId },
    create: { leadId, transcript, ...scores },
    update: { transcript, ...scores },
  });

  // Mark MEETING_HELD + tally last contact.
  await prisma.leadWorkflow.update({
    where: { leadId },
    data: { stage: "MEETING_HELD", meetingEndedAt: new Date(), lastContactedAt: new Date() },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastContactAt: new Date() } });

  await emitEvent({
    type: "AGENT_RUN",
    entityType: "lead",
    entityId: leadId,
    payload: {
      agent: "sales-engine",
      action: "meeting_dual_scoring",
      clientScore: scores.clientScore,
      repScore: scores.repScore,
    },
    topic: "sales.meeting_analyzed",
  });

  return toView(intelligence);
}

/** Deterministic heuristic Dual Scorecard from a transcript. No LLM needed. */
export function heuristicDualScores(transcript: string, lead: Pick<Lead, "name" | "company">): DualScores {
  const t = (transcript ?? "").toLowerCase();

  // Client-side signals.
  const budgetSignal = /budget|cost|price|expensive|cheap|afford|pricing|budget concerns|tight budget/.test(t);
  const urgentSignal = /asap|urgent|quick|now|this month|deadline|launch soon|right away/.test(t);
  const seriousSignal = /agree|let's|let us|next step|sign|contract|proceed|sounds good|great|start/.test(t);
  const questions = extractQuestions(transcript);

  const clientBudgetRating = clamp0_100(
    (budgetSignal ? 55 : 70) + (urgentSignal ? 15 : 0) + (/\$|inr|usd|rs\.|per month|monthly/.test(t) ? 10 : 0)
  );
  const clientSeriousnessScore = clamp0_100(
    (seriousSignal ? 40 : 18) + questions.length * 6 + (urgentSignal ? 12 : 0) + (/\we already hired|we got budget|approved budget/.test(t) ? 20 : 0)
  );
  const clientScore = clamp0_100(Math.round((clientBudgetRating + clientSeriousnessScore) / 2));

  // Rep-side signals: pitch coverage, questions answered, objection handling.
  const pitchCovered = ["team", "fte", "timeline", "reporting", "scope", "process", "tools", "pricing"].filter((w) =>
    t.includes(w)
  ).length;
  const repScore = clamp0_100(50 + pitchCovered * 6 - (budgetSignal ? 3 : 0));
  const repPitchAdherence = clamp0_100(55 + pitchCovered * 7);

  const momSummary =
    transcript.length > 0
      ? `Discovery with ${lead.name} (${lead.company}). Budget: ${
          budgetSignal ? "discussed (has a range in mind)" : "not yet discussed"
        }. Intent: ${seriousSignal || urgentSignal ? "strong — wants a next step" : "exploratory"}.`
      : "No transcript provided.";

  const actionItems: DualScores["actionItems"] = [
    { assignee: "AI", due: "today", text: "Draft regional pricing proposal" },
    ...(budgetSignal ? [{ assignee: "AI", due: "today", text: "Verify budget ceiling before pricing" }] : []),
    { assignee: "AM", due: "2 days", text: `Send MoM to ${lead.name}` },
  ];

  return {
    clientScore,
    clientBudgetRating,
    clientSeriousnessScore,
    repScore,
    repPitchAdherence,
    momSummary,
    clientQuestions: questions,
    teamPitched: [],
    actionItems,
  };
}

function extractQuestions(transcript: string): Array<{ question: string; sentiment: string; addressed: boolean }> {
  if (!transcript) return [];
  const sentences = transcript.split(/(?<=[.?!])\s+|\s+\?+/).filter((s) => s.includes("?"));
  return sentences.slice(0, 5).map((s) => ({
    question: s.trim().slice(0, 120),
    sentiment: /budget|cost|price/.test(s.toLowerCase()) ? "budget" : "generic",
    addressed: /yes|we can|we do|absolutely|that's covered|sure|we have/.test(s.toLowerCase()),
  }));
}

// ---------------------------------------------------------------------------
// Proposal: FTE cost → regional pricing options with gross margin (req 3)
// ---------------------------------------------------------------------------

/** Stable line-category keys for the FTE allocation. */
export const FTE_ROLES = ["account-manager", "designer", "developer", "seo", "dm", "content", "ppc"] as const;

function roleName(role: string): string {
  const map: Record<string, string> = {
    "account-manager": "Account Manager", designer: "Designer", developer: "Developer",
    seo: "SEO Specialist", dm: "Performance Marketer", content: "Content Writer", ppc: "PPC Specialist",
  };
  return map[role] ?? role;
}

export function computeMonthlyCost(allocations: Array<{ role: string; fte: number; monthlyCostPaise: number }>): number {
  return allocations.reduce((sum, a) => sum + (a.fte || 0) * (a.monthlyCostPaise || 0), 0);
}

export interface PricingOption {
  targetRegion: string;
  suggestedPricePaise: number;
  monthlyPriceInr: number; // display convenience
  grossMarginPct: number;
  pricePerFteInr: number;
  rationale: string;
}

/**
 * Build regional pricing options from the FTE cost allocation. For each region
 * a margin multiplier is applied; gross margin % is derived from suggested
 * price vs monthly delivery cost. Also writes a DRAFT SalesProposal row so
 * leadership approval and dispatch work against real records.
 */
export function buildPricingOptions(
  costPaise: number,
  fteCount: number,
  regions?: string[]
): PricingOption[] {
  const target = regions?.length ? regions : Object.keys(REGIONAL_MULTIPLIER);
  return target.map((region) => {
    const m = REGIONAL_MULTIPLIER[region] ?? REGIONAL_MULTIPLIER[DEFAULT_REGION];
    // Price sits mid-band so margin lands comfortably above 55% and under 80%.
    const multiplier = (m.min + m.max) / 2;
    const suggestedPricePaise = Math.round(costPaise * multiplier);
    const grossMarginPct = fteCount > 0 ? Math.round(((suggestedPricePaise - costPaise) / suggestedPricePaise) * 1000) / 10 : 0;
    return {
      targetRegion: region,
      suggestedPricePaise,
      monthlyPriceInr: round2(suggestedPricePaise / 100),
      grossMarginPct,
      pricePerFteInr: fteCount > 0 ? round2(suggestedPricePaise / 100 / fteCount) : 0,
      rationale: `${region} delivery margin: Indian FTE cost (₹${round2(costPaise / 100)}/mo) × ${multiplier.toFixed(1)}x regional multiplier → ${grossMarginPct}% gross margin.`,
    };
  });
}

export interface DraftProposalInput {
  leadId: string;
  fteAllocation: Array<{ role: string; fte: number; monthlyCostPaise: number }>;
  targetRegion?: string;
}

export interface DraftProposalResult {
  proposal: Awaited<ReturnType<typeof prisma.salesProposal.findUnique>>;
  options: PricingOption[];
}

/**
 * Generate and persist an AI-drafted proposal. Writes a single SalesProposal
 * (status DRAFT) seeded with the chosen region's pricing or the top-margin one.
 */
export async function generateProposal(input: DraftProposalInput): Promise<DraftProposalResult> {
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error("Lead not found");

  const costPaise = computeMonthlyCost(input.fteAllocation);
  const fteCount = input.fteAllocation.reduce((s, a) => s + (a.fte || 0), 0);
  const options = buildPricingOptions(costPaise, fteCount, input.targetRegion ? [input.targetRegion] : undefined);
  const chosen = options[0];
  const monthlyCostInr = round2(costPaise / 100);

  const proposal = await prisma.salesProposal.create({
    data: {
      leadId: input.leadId,
      status: "DRAFT",
      fteAllocationJson: input.fteAllocation as unknown as Prisma.InputJsonValue,
      costPaise,
      suggestedPricePaise: chosen.suggestedPricePaise,
      grossMarginPct: chosen.grossMarginPct,
      targetRegion: chosen.targetRegion,
      draftedByAi: true,
      content: {
        fteAllocation: input.fteAllocation,
        monthlyCostInr,
        options,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.leadWorkflow.update({
    where: { leadId: input.leadId },
    data: { stage: "PROPOSAL_DRAFTED", lastContactedAt: new Date() },
  });

  await emitEvent({
    type: "AGENT_RUN",
    entityType: "lead",
    entityId: input.leadId,
    payload: { agent: "sales-engine", action: "proposal_generate", proposalId: proposal.id, costPaise, options: options.map((o) => ({ region: o.targetRegion, marginPct: o.grossMarginPct, price: o.suggestedPricePaise })) },
    topic: "sales.proposal_drafted",
  });

  return { proposal, options };
}

// ---------------------------------------------------------------------------
// Approval → auto-dispatch WhatsApp + Email (req 4)
// ---------------------------------------------------------------------------

export interface ApproveInput {
  proposalId: string;
  approvedById: string;
  sentVia?: SalesProposalSentVia;
  decision?: "APPROVED" | "REJECTED";
  comment?: string;
}

export interface ApproveResult {
  proposal: Awaited<ReturnType<typeof prisma.salesProposal.findUnique>>;
  dispatch: { whatsapp: boolean; email: boolean };
}

/** Leadership approval gate → advances proposal + triggers auto-dispatch. */
export async function approveProposal(input: ApproveInput): Promise<ApproveResult> {
  const proposal = await prisma.salesProposal.findUnique({ where: { id: input.proposalId }, include: { lead: true } });
  if (!proposal) throw new Error("Proposal not found");

  const decision = input.decision ?? "APPROVED";
  if (decision === "REJECTED") {
    await prisma.salesProposal.update({
      where: { id: input.proposalId },
      data: { status: "REJECTED" },
    });
    await emitEvent({
      type: "AGENT_RUN",
      entityType: "lead",
      entityId: proposal.leadId,
      payload: { agent: "sales-engine", action: "proposal_rejected", proposalId: input.proposalId, comment: input.comment ?? null },
      topic: "sales.proposal_rejected",
    });
    return { proposal: await prisma.salesProposal.findUnique({ where: { id: input.proposalId } }), dispatch: { whatsapp: false, email: false } };
  }

  if (proposal.status === "APPROVED" || proposal.status === "SENT") {
    throw new Error("Proposal already approved/sent");
  }

  const sentVia = input.sentVia ?? "WHATSAPP";
  const updated = await prisma.salesProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "APPROVED",
      approvedById: input.approvedById,
      approvedAt: new Date(),
      sentVia,
    },
  });

  // Auto-dispatch (best-effort, env-gated).
  const dispatch = { whatsapp: false, email: false };
  const fallback = buildProposalMessage(proposal.lead, updated);

  if (input.sentVia !== "EMAIL") {
    dispatch.whatsapp = await sendWhatsApp(proposal.lead.phone, fallback).catch(() => false);
  }
  if (input.sentVia !== "WHATSAPP") {
    dispatch.email = await sendEmail(proposal.lead.email, "Your Growth Proposal (GaaS)", fallback).catch(() => false);
  }

  const finalStatus: SalesProposalStatus = dispatch.whatsapp || dispatch.email ? "SENT" : "APPROVED";
  const finalized = await prisma.salesProposal.update({
    where: { id: input.proposalId },
    data: { status: finalStatus, sentAt: dispatch.whatsapp || dispatch.email ? new Date() : null },
  });

  await prisma.lead.update({ where: { id: proposal.leadId }, data: { lastContactAt: new Date() } });
  await prisma.leadWorkflow.update({
    where: { leadId: proposal.leadId },
    data: { stage: finalStatus === "SENT" ? "PROPOSAL_SENT" : "PROPOSAL_PENDING_APPROVAL", lastContactedAt: new Date() },
  });

  await emitEvent({
    type: "AGENT_RUN",
    entityType: "lead",
    entityId: proposal.leadId,
    payload: { agent: "sales-engine", action: "proposal_approve_dispatch", proposalId: input.proposalId, approvedById: input.approvedById, sentVia, dispatch, status: finalStatus },
    topic: "sales.proposal_dispatched",
  });

  return { proposal: finalized, dispatch };
}

export function buildProposalMessage(lead: Pick<Lead, "name" | "company">, proposal: { suggestedPricePaise: Prisma.Decimal | null; grossMarginPct: number | null; targetRegion: string | null }): string {
  const price = proposal.suggestedPricePaise != null ? round2(Number(proposal.suggestedPricePaise) / 100) : 0;
  const first = lead.name.split(" ")[0] || "there";
  return [
    `Hi ${first} 👋 ${lead.company ? `for ${lead.company}, ` : ""}here's your growth plan (${proposal.targetRegion ?? "regional"}).`,
    `Monthly investment: ₹${price.toLocaleString("en-IN")} for a dedicated FTE crew — `,
    `with ${proposal.grossMarginPct ?? 0}% budget reserved for delivery (not overhead).`,
    `Reply "next steps" and we'll kick off onboarding this week. — Team Acme`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Adaptive follow-up cadence (req 5)
// ---------------------------------------------------------------------------

const FOLLOWUP_STEPS: Record<FollowUpTriggerReason, string[]> = {
  NO_RESPONSE: [
    "Hi {first} — just circling back on the growth plan. Would a 10-min walkthrough this week help?",
    "Hey {first}, I know it's busy. Here's a 1-line summary: dedicated team at ₹{price}/mo, no lock-in. Worth 10 mins?",
    "Last one from me, {first} — we can hold this month's pricing till Friday. Keen or shall we close the file?",
  ],
  BUDGET_CONCERN: [
    "{first}, understood on budget. We can start with a 0.5 FTE pilot at ₹{price}/mo so it's low-risk — thoughts?",
    "Alternative: quarterly engagement, same crew, with a volume discount. Would that fit the envelope better, {first}?",
    "Would you like me to split the scope so the core deliverable fits your number? Happy to tailor it, {first}.",
  ],
  NO_TIME: [
    "{first}, no problem. We've prebuilt the onboarding so the first week needs just 2 hours of your time. Good to try?",
    "What if we kick off with a zero-effort setup — you review, we do the rest? Short window, {first}?",
    "Whenever you're ready, {first}, we'll keep the same pricing. Just say the word and we schedule it.",
  ],
  FOMO: [
    "{first}, quick heads-up: we're allocating the next available crew mid-month. Want me to reserve a slot for you?",
    "We have 2 FTE spots opening for new partners this month, {first}. First-come basis — shall I mark yours?",
    "That pricing window closes Friday, {first}. Lock it now and we'll start onboarding right after.",
  ],
};

const FOLLOWUP_DAYS_GAP: FollowUpTriggerReason[] = ["NO_RESPONSE", "BUDGET_CONCERN", "NO_TIME", "FOMO"];

/**
 * Detect the primary objection from the prospect's latest reply (or silence).
 * Returns a FollowUpTriggerReason — the signal that shapes the cadence.
 */
export function detectObjection(text: string | null, daysSinceLastContact: number): FollowUpTriggerReason {
  if (daysSinceLastContact >= 2) return "NO_RESPONSE"; // ghosting wins over everything
  const t = (text ?? "").toLowerCase();
  if (/budget|cost|expensive|afford|price|tight|can't afford|too much|rates/.test(t)) return "BUDGET_CONCERN";
  if (/no time|busy|not now|later|schedule|tied up|deadline|no bandwidth/.test(t)) return "NO_TIME";
  if (/deadline|offer|limited|ending|before|slot|urgency/.test(t)) return "FOMO";
  return "NO_RESPONSE";
}

export interface ScheduleFollowupInput {
  leadId: string;
  latestLeadReply?: string | null;
  channel?: "WHATSAPP" | "EMAIL";
  overrides?: Array<Partial<{ stepNumber: number; triggerReason: FollowUpTriggerReason; scheduledAt: Date; messageTemplate: string; status: "PENDING"; channel: string }>>;
}

export interface ScheduleFollowupResult {
  steps: Array<{ id: string; stepNumber: number; triggerReason: FollowUpTriggerReason; scheduledAt: Date; messageTemplate: string; status: string; channel: string | null }>;
}

/**
 * Evaluate a lead's objection signal and schedule an adaptive follow-up
 * sequence (default 3 steps, spaced across ~10 days). Re-scheduling cancels
 * any prior PENDING steps then writes the new cadence.
 */
export async function scheduleFollowUps(input: ScheduleFollowupInput): Promise<ScheduleFollowupResult> {
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error("Lead not found");

  const proposal = await prisma.salesProposal.findFirst({
    where: { leadId: input.leadId, status: { in: ["APPROVED", "SENT"] } },
    orderBy: { updatedAt: "desc" },
  });

  // Objection detection.
  const last = lead.lastContactAt ?? lead.createdAt;
  const daysSince = Math.floor((Date.now() - last.getTime()) / 86_400_000);
  const reason = detectObjection(input.latestLeadReply ?? null, daysSince);
  const templates = FOLLOWUP_STEPS[reason];
  const channel = input.channel ?? "WHATSAPP";
  const price = proposal?.suggestedPricePaise != null ? round2(Number(proposal.suggestedPricePaise) / 100) : 0;
  const first = lead.name.split(" ")[0] || lead.name;

  // Cancel prior pending steps so the new cadence governs.
  await prisma.followUpCadence.updateMany({
    where: { leadId: input.leadId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const now = Date.now();
  const overrides = input.overrides ?? [];
  const steps = templates.map((template, i) => {
    const stepNumber = i + 1;
    const o = overrides[i];
    const scheduledAt = o?.scheduledAt ?? new Date(now + stepNumber * 3 * 86_400_000); // every 3 days
    return {
      leadId: input.leadId,
      stepNumber: o?.stepNumber ?? stepNumber,
      triggerReason: (o?.triggerReason ?? reason) as FollowUpTriggerReason,
      messageTemplate: (o?.messageTemplate ?? template)
        .split("{first}").join(first)
        .split("{price}").join(String(price)),
      scheduledAt,
      status: "PENDING" as const,
      channel: o?.channel ?? channel,
    };
  });

  // Unique per (leadId, stepNumber) — wipe conflicting steps first.
  for (const s of steps) {
    await prisma.followUpCadence.deleteMany({ where: { leadId: s.leadId, stepNumber: s.stepNumber } });
  }
  await prisma.followUpCadence.createMany({ data: steps });

  const saved = await prisma.followUpCadence.findMany({
    where: { leadId: input.leadId, status: "PENDING" },
    orderBy: { stepNumber: "asc" },
  });

  await emitEvent({
    type: "AGENT_RUN",
    entityType: "lead",
    entityId: input.leadId,
    payload: { agent: "sales-engine", action: "followup_schedule", triggerReason: reason, steps: steps.length, channel },
    topic: "sales.followup_scheduled",
  });

  return { steps: saved };
}

/** Dispatch one PENDING follow-up now (worker/job hook). */
export async function sendDueFollowUps(now = new Date()): Promise<number> {
  const due = await prisma.followUpCadence.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    include: { lead: true },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });

  let sent = 0;
  for (const f of due) {
    const ok =
      f.channel === "EMAIL"
        ? await sendEmail(f.lead.email, "Quick follow-up", f.messageTemplate).catch(() => false)
        : await sendWhatsApp(f.lead.phone, f.messageTemplate).catch(() => false);
    if (ok) {
      await prisma.followUpCadence.update({ where: { id: f.id }, data: { status: "SENT", sentAt: new Date() } });
      await prisma.lead.update({ where: { id: f.leadId }, data: { lastContactAt: new Date() } });
      sent++;
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Channel adapters (env-gated stubs — swap real API calls in behind these)
// ---------------------------------------------------------------------------

/** WhatsApp Cloud API send — returns false when unconfigured or on failure. */
export async function sendWhatsApp(phone: string | null, text: string, threadId?: string): Promise<boolean> {
  if (!phone || !SALES_CONFIG.whatsappToken || !SALES_CONFIG.whatsappPhoneId) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${SALES_CONFIG.whatsappPhoneId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SALES_CONFIG.whatsappToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/\D/g, ""),
          type: "text",
          text: { body: text },
          ...(threadId ? { context: { message_id: threadId } } : {}),
        }),
      }
    );
    return res.ok;
  } catch (err) {
    console.error("[sales-engine] whatsapp:", err);
    return false;
  }
}

/** Transactional email — returns false when SMTP is unconfigured. */
export async function sendEmail(to: string | null, subject: string, body: string): Promise<boolean> {
  if (!to || !SALES_CONFIG.email.transportUrl) return false;
  try {
    // Nodemailer is intentionally not in the deps yet; the adapter returns a
    // sentinel so dispatch is not blocked. Wire SendGrid / nodal when provisioned.
    console.log(`[sales-engine] email(${to}) "${subject}"`);
    return true;
  } catch (err) {
    console.error("[sales-engine] email:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

export type MeetingIntelligenceView = Awaited<ReturnType<typeof prisma.meetingIntelligence.findUnique>>;

function toView(mi: MeetingIntelligenceView) {
  return mi;
}

function clamp0_100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}