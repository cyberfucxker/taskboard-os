/**
 * One-time (and safely re-runnable) setup for the CRM ported from the legacy CRM.
 *
 *   npx tsx scripts/crm-bootstrap.ts            # dry run: prints what it would do
 *   npx tsx scripts/crm-bootstrap.ts --apply    # does it
 *
 * 1. Seeds Acme's default pipeline and a starter tag set if the CRM has none.
 * 2. Copies every row of TaskBoard's old `Lead` table into `CrmLead`, keyed by `legacyLeadId`, so
 *    running it twice never duplicates a lead. The old table is left untouched — it is retired
 *    in a later release, once the copy has been checked (expand / contract).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { crmSourceFor, ensureDefaultPipeline, placementFor } from "../src/lib/crm/bridge";
import { emailNormalized, nameParts, phoneKeys } from "../src/lib/leads/normalize";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const STARTER_TAGS = [
  { name: "Hot", color: "#F85149" },
  { name: "Warm", color: "#D29922" },
  { name: "Cold", color: "#56A7B0" },
  { name: "Retainer", color: "#6DBB7C" },
  { name: "One-time project", color: "#A78BFA" },
  { name: "Referral", color: "#3E8B93" },
];

function utmField(utm: unknown, key: string): string | null {
  if (!utm || typeof utm !== "object") return null;
  const v = (utm as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function main() {
  console.log(APPLY ? "Applying CRM bootstrap…" : "Dry run (pass --apply to write).");

  const pipelines = await prisma.crmPipeline.count();
  if (pipelines === 0) {
    console.log("• No CRM pipeline yet — will create the Acme Sales Pipeline.");
    if (APPLY) await ensureDefaultPipeline(prisma);
  } else {
    console.log(`• ${pipelines} CRM pipeline(s) already exist — left as they are.`);
  }

  const tags = await prisma.crmTag.count();
  if (tags === 0) {
    console.log(`• Will create ${STARTER_TAGS.length} starter tags.`);
    if (APPLY) await prisma.crmTag.createMany({ data: STARTER_TAGS });
  }

  const legacy = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
  const already = new Set(
    (await prisma.crmLead.findMany({ where: { legacyLeadId: { not: null } }, select: { legacyLeadId: true } })).map(
      (r) => r.legacyLeadId
    )
  );
  const todo = legacy.filter((l) => !already.has(l.id));
  console.log(`• Old TaskBoard leads: ${legacy.length} total, ${already.size} already copied, ${todo.length} to copy.`);

  for (const l of todo) {
    const { firstName, lastName } = nameParts(l.name);
    if (!APPLY) {
      // placementFor() creates the default pipeline when it is missing, so a dry run must not call it.
      console.log(`  - ${l.name} (${l.stage}, ${l.source}) -> ${crmSourceFor(l.source)}`);
      continue;
    }
    const place = await placementFor(l.stage, prisma);
    const notes = [l.nextStep ? `Next step: ${l.nextStep}` : null, l.disposition ? `Disposition: ${l.disposition}` : null]
      .filter(Boolean)
      .join("\n");
    const data: Prisma.CrmLeadUncheckedCreateInput = {
      legacyLeadId: l.id,
      firstName: firstName || "Unknown",
      lastName,
      company: l.company && l.company !== "Unknown" ? l.company : null,
      email: l.email,
      emailNormalized: l.emailNormalized ?? emailNormalized(l.email),
      phone: l.phone ?? "",
      phoneNormalized: l.phoneNormalized ?? phoneKeys(l.phone)[0] ?? null,
      source: crmSourceFor(l.source),
      pipelineId: place.pipelineId,
      pipelineStageId: place.pipelineStageId,
      stageEnteredAt: l.updatedAt,
      status: place.status,
      leadScore: l.score,
      assignedUserId: l.ownerId,
      notes: notes || null,
      contactedAt: l.lastContactAt,
      nextFollowUpAt: l.nextActionDate,
      lostReason: l.lossReason,
      lostAt: l.stage === "LOST" ? l.updatedAt : null,
      wonAt: l.stage === "WON" ? l.convertedAt ?? l.updatedAt : null,
      convertedClientId: l.clientId,
      utmSource: utmField(l.utm, "utm_source") ?? utmField(l.utm, "source"),
      utmMedium: utmField(l.utm, "utm_medium"),
      utmCampaign: utmField(l.utm, "utm_campaign") ?? utmField(l.utm, "campaign"),
      createdAt: l.createdAt,
    };
    console.log(`  - ${l.name} (${l.stage}, ${l.source}) -> ${data.source}, ${place.status}`);

    await prisma.$transaction(async (tx) => {
      const created = await tx.crmLead.create({ data });
      await tx.crmActivity.create({
        data: {
          leadId: created.id,
          type: "created",
          description: `Lead "${l.name}" copied from TaskBoard's previous CRM.`,
          userName: "System",
          createdAt: l.createdAt,
        },
      });
    });
  }

  console.log(APPLY ? "Done." : "Dry run complete — nothing was written.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
