#!/usr/bin/env npx tsx
import { decrypt } from "../src/crm-server/services/crypto";
/**
 * Backfill T7 enrichment for existing Meta leads that are missing full adDetail.
 *
 * Usage:
 *   npx tsx scripts/backfill-meta-leads.ts          # dry-run (default)
 *   npx tsx scripts/backfill-meta-leads.ts --apply  # write changes to DB
 *
 * Safety rules:
 *  - Never overwrites firstName, lastName, email, phone, company (sales-edited fields)
 *  - Only updates adDetail, otherSource, utmCampaign, utmContent, utmTerm
 *  - Skips leads that already have adDetail.campaignId set (already enriched)
 *  - Logs every lead it would touch before applying
 *  - Staging only; lead session runs live backfill
 */

import { PrismaClient } from "@prisma/client";
import axios from "axios";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

interface MetaLeadData {
  id: string;
  form_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  platform?: string;
  is_organic?: boolean;
  created_time?: string;
  field_data?: Array<{ name: string; values: string[] }>;
}

async function fetchLeadData(leadgenId: string, pageToken: string): Promise<MetaLeadData> {
  const fields = "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic,field_data";
  const { data } = await axios.get(
    `https://graph.facebook.com/v21.0/${leadgenId}?fields=${fields}&access_token=${pageToken}`,
    { timeout: 15_000 }
  );
  return data;
}

async function getFormName(formId: string, pageToken: string): Promise<string | null> {
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v21.0/${formId}?fields=name&access_token=${pageToken}`,
      { timeout: 10_000 }
    );
    return data?.name ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\nMeta lead backfill — ${apply ? "APPLY mode" : "DRY-RUN mode"}`);
  console.log("=".repeat(55));

  const connections = await prisma.crmSourceConnection.findMany({
    where: { source: "meta", active: true },
    select: { id: true, metaPageId: true, metaPageAccessToken: true },
  });

  if (connections.length === 0) {
    console.log("No active Meta source connections found. Exiting.");
    return;
  }

  console.log(`Found ${connections.length} Meta connection(s).`);

  let total = 0;
  let enriched = 0;
  let skipped = 0;
  let failed = 0;

  for (const conn of connections) {
    if (!conn.metaPageAccessToken) {
      console.log(`  Connection ${conn.id} has no page access token — skipping.`);
      continue;
    }

    const pageToken = decrypt(conn.metaPageAccessToken); // stored encrypted at rest

    const leads = await prisma.crmLead.findMany({
      where: {
        source: "meta",
        sourceConnectionId: conn.id,
        NOT: { externalLeadId: null },
      },
      select: {
        id: true,
        externalLeadId: true,
        adDetail: true,
        otherSource: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const needsEnrichment = leads.filter((l) => {
      const ad = l.adDetail as Record<string, unknown> | null;
      return !ad?.campaignId;
    });

    console.log(`\n  Page ${conn.metaPageId}: ${leads.length} leads total, ${needsEnrichment.length} need enrichment`);
    total += needsEnrichment.length;

    for (const lead of needsEnrichment) {
      const leadgenId = lead.externalLeadId!;
      process.stdout.write(`    Lead ${leadgenId} ... `);

      let leadData: MetaLeadData;
      try {
        leadData = await fetchLeadData(leadgenId, pageToken);
      } catch (err) {
        console.log(`GRAPH ERROR: ${(err as Error).message}`);
        failed += 1;
        continue;
      }

      const formName = leadData.form_id ? await getFormName(leadData.form_id, pageToken) : null;

      const platformLabel = leadData.platform
        ? (({ fb: "Facebook", ig: "Instagram", an: "Audience Network", msg: "Messenger" } as Record<string, string>)[leadData.platform.toLowerCase()] ?? leadData.platform)
        : "Meta";
      const otherSourceParts = [platformLabel];
      if (leadData.campaign_name) otherSourceParts.push(leadData.campaign_name);
      if (formName) otherSourceParts.push(formName);
      const otherSource = otherSourceParts.join(" · ");

      const existingAd = (lead.adDetail as Record<string, unknown>) ?? {};
      const newAdDetail = {
        ...existingAd,
        formName: formName ?? existingAd.formName ?? null,
        formId: leadData.form_id ?? existingAd.formId ?? null,
        campaignId: leadData.campaign_id ?? null,
        campaignName: leadData.campaign_name ?? null,
        adsetId: leadData.adset_id ?? null,
        adsetName: leadData.adset_name ?? null,
        adId: leadData.ad_id ?? null,
        adName: leadData.ad_name ?? null,
        platform: leadData.platform ?? null,
        isOrganic: leadData.is_organic ?? null,
        createdTime: leadData.created_time ?? null,
        pageId: conn.metaPageId,
        leadgenId,
      };

      console.log(`${apply ? "updating" : "would update"} → ${otherSource}`);

      if (apply) {
        await prisma.crmLead.update({
          where: { id: lead.id },
          data: {
            adDetail: newAdDetail,
            otherSource,
            utmCampaign: leadData.campaign_name ?? undefined,
            utmContent: leadData.ad_name ?? undefined,
            utmTerm: leadData.adset_name ?? undefined,
          },
        });
      }

      enriched += 1;

      // Throttle to avoid Graph rate limits (~8 req/s safe for page token)
      await new Promise((r) => setTimeout(r, 120));
    }

    skipped += leads.length - needsEnrichment.length;
  }

  console.log("\n" + "=".repeat(55));
  console.log(`Done. Total: ${total} | Enriched: ${enriched} | Already done: ${skipped} | Failed: ${failed}`);
  if (!apply) {
    console.log("\nThis was a DRY RUN. Re-run with --apply to write changes.");
  }
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
