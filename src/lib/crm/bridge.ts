import type { CrmLeadStatus, LeadSource, LeadStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The seam between TaskBoard's older lead code (TeleCRM sync, CSV import, Meta webhook, MCP) and
 * the CRM ported from the legacy CRM. Everything that creates a lead from outside the CRM screens
 * goes through here, so a TeleCRM row and a lead typed into /crm/leads/new land identically:
 * on the default pipeline, with a stage, a status, a source badge and a "created" activity.
 */

/** Acme's sales funnel. Seeded once by scripts/crm-bootstrap.ts; created lazily if missing. */
export const DEFAULT_PIPELINE_NAME = "Acme Sales Pipeline";

export const DEFAULT_STAGES: {
  name: string;
  color: string;
  winProbability: number;
  isWon?: boolean;
  isLost?: boolean;
}[] = [
  { name: "New Lead", color: "#3E8B93", winProbability: 10 },
  { name: "Contacted", color: "#56A7B0", winProbability: 20 },
  { name: "Discovery Call", color: "#A78BFA", winProbability: 35 },
  { name: "Proposal Sent", color: "#D29922", winProbability: 55 },
  { name: "Negotiation", color: "#F0883E", winProbability: 75 },
  { name: "Won", color: "#6DBB7C", winProbability: 100, isWon: true },
  { name: "Lost", color: "#F85149", winProbability: 0, isLost: true },
];

/** Where each stage of TaskBoard's old fixed LeadStage enum lands in the default pipeline. */
const LEGACY_STAGE: Record<LeadStage, { stage: string; status: CrmLeadStatus }> = {
  NEW: { stage: "New Lead", status: "new" },
  CONTACTED: { stage: "Contacted", status: "contacted" },
  QUALIFIED: { stage: "Discovery Call", status: "qualified" },
  NEEDS_ANALYSIS: { stage: "Discovery Call", status: "qualified" },
  PROPOSAL_SENT: { stage: "Proposal Sent", status: "qualified" },
  NEGOTIATION: { stage: "Negotiation", status: "qualified" },
  WON: { stage: "Won", status: "won" },
  LOST: { stage: "Lost", status: "lost" },
};

/**
 * TaskBoard's LeadSource enum -> the CRM's free-text source key (the keys the CRM's source badges
 * know, see src/crm-ui/constants/leadSources.ts). Sources the CRM had no key for get their own.
 */
const LEGACY_SOURCE: Record<LeadSource, string> = {
  INBOUND: "web_form",
  META_LEAD_ADS: "meta",
  GOOGLE_LEAD_FORM: "google_ads",
  WHATSAPP: "whatsapp",
  LINKEDIN: "linkedin",
  EMAIL: "email",
  MANUAL: "manual",
  IMPORTED: "import",
  TELECRM: "telecrm",
  INDIA_MART: "indiamart",
  JUSTDIAL: "justdial",
  MARKETPLACE: "marketplace",
  REFERRAL: "referral",
  CALL: "call",
  WALK_IN: "walk_in",
  CHATBOT: "chatbot",
  OUTBOUND: "outbound",
  WEBINAR: "webinar",
};

export function crmSourceFor(source: LeadSource | null | undefined, fallback = "manual"): string {
  return source ? LEGACY_SOURCE[source] : fallback;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The default pipeline with its stages, creating Acme's funnel if the CRM has none yet. */
export async function ensureDefaultPipeline(db: Db = prisma) {
  const existing =
    (await db.crmPipeline.findFirst({ where: { isDefault: true }, include: { stages: true } })) ??
    (await db.crmPipeline.findFirst({ orderBy: { createdAt: "asc" }, include: { stages: true } }));
  if (existing) return existing;

  return db.crmPipeline.create({
    data: {
      name: DEFAULT_PIPELINE_NAME,
      description: "Inbound and outbound prospects for Acme's agency services.",
      isDefault: true,
      stages: {
        create: DEFAULT_STAGES.map((s, i) => ({
          name: s.name,
          color: s.color,
          sortOrder: i + 1,
          winProbability: s.winProbability,
          isWon: !!s.isWon,
          isLost: !!s.isLost,
        })),
      },
    },
    include: { stages: true },
  });
}

/**
 * Pipeline + stage + status for a lead arriving with one of the old LeadStage values.
 * Falls back to the pipeline's first stage when the named stage was renamed or deleted in the
 * pipeline manager — the lead still lands somewhere visible rather than stage-less.
 */
export async function placementFor(stage: LeadStage | null | undefined, db: Db = prisma) {
  const pipeline = await ensureDefaultPipeline(db);
  const target = LEGACY_STAGE[stage ?? "NEW"];
  const ordered = [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const hit =
    ordered.find((s) => s.name.toLowerCase() === target.stage.toLowerCase()) ??
    (target.status === "won" ? ordered.find((s) => s.isWon) : undefined) ??
    (target.status === "lost" ? ordered.find((s) => s.isLost) : undefined) ??
    ordered[0];
  return {
    pipelineId: pipeline.id,
    pipelineStageId: hit?.id ?? null,
    status: target.status,
  };
}

/**
 * Derives the right pipeline for a Meta lead by matching the form name and campaign name
 * against the names of all pipelines in the DB. Uses simple keyword overlap so it stays
 * self-maintaining as new pipelines are added in the CRM settings UI.
 *
 * Examples (pipelines named "Real Estate" and "Hiring" exist):
 *   "Real Estate - Plot Enquiry 2026"   → Real Estate pipeline
 *   "Hiring | Designer"                 → Hiring pipeline
 *   "Digital Marketing Ads - August"    → Acme Sales Pipeline (default)
 */
function parsePipelineOverrides(raw: string | undefined): Array<{ keywords: string[]; pipelineName: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o) => o && Array.isArray(o.keywords) && typeof o.pipelineName === "string")
      .map((o) => ({
        keywords: o.keywords.map((k: unknown) => String(k).toLowerCase()),
        pipelineName: String(o.pipelineName).toLowerCase(),
      }));
  } catch {
    return [];
  }
}

export async function metaPipelinePlacement(
  formName: string | null | undefined,
  campaignName: string | null | undefined,
  db: Db = prisma
): Promise<{ pipelineId: string; pipelineStageId: string | null; status: CrmLeadStatus }> {
  const searchText = [formName, campaignName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const allPipelines = await db.crmPipeline.findMany({
    include: { stages: true },
    orderBy: { createdAt: "asc" },
  });

  // Explicit form/campaign substring -> pipeline name substring overrides.
  // These catch cases where the pipeline name alone doesn't contain the matching keyword.
  // Configure with CRM_PIPELINE_OVERRIDES, a JSON array such as:
  //   [{"keywords":["real estate","plot"],"pipelineName":"real estate"},
  //    {"keywords":["hiring","designer"],"pipelineName":"hiring"}]
  // Leads that match nothing fall through to keyword scoring, then the default pipeline.
  const EXPLICIT_OVERRIDES = parsePipelineOverrides(process.env.CRM_PIPELINE_OVERRIDES);

  for (const override of EXPLICIT_OVERRIDES) {
    const hit = override.keywords.some((kw) => searchText.includes(kw));
    if (hit) {
      const matched = allPipelines.find((pl) =>
        pl.name.toLowerCase().includes(override.pipelineName)
      );
      if (matched) {
        const orderedFirst = [...matched.stages].sort((a, b) => a.sortOrder - b.sortOrder);
        return {
          pipelineId: matched.id,
          pipelineStageId: orderedFirst[0]?.id ?? null,
          status: "new" as CrmLeadStatus,
        };
      }
    }
  }

  // Build per-pipeline keyword sets from their names (split on non-word chars, min 3 chars).
  // Skip the default Acme pipeline — it's the catch-all, never a keyword match.
  const nonDefault = allPipelines.filter((p) => !p.isDefault);

  let bestPipeline: (typeof allPipelines)[0] | null = null;
  let bestScore = 0;

  for (const pipeline of nonDefault) {
    const keywords = pipeline.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    let score = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw)) score += kw.length; // longer matches score higher
    }

    if (score > bestScore) {
      bestScore = score;
      bestPipeline = pipeline;
    }
  }

  const pipeline = bestPipeline ?? allPipelines.find((p) => p.isDefault) ?? allPipelines[0];
  const ordered = [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const firstStage = ordered[0];

  return {
    pipelineId: pipeline.id,
    pipelineStageId: firstStage?.id ?? null,
    status: "new" as CrmLeadStatus,
  };
}
