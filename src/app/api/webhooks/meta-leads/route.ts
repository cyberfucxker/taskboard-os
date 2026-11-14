import { isHiringForm } from "@/crm-server/services/leadFieldMapping";
import { getOrCreateHiringPipeline } from "@/crm-server/services/hiringPipeline";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/meta-webhook-auth";
import { fetchLeadData } from "@/lib/metaService";
import { decrypt } from "@/crm-server/services/crypto";
import { fetchOptionLabels, applyT7FieldMap, buildMetaNotesBlock, ensureCustomFields, saveCustomValues } from "@/crm-server/services/leadFieldMapping";
import { getFormName } from "@/crm-server/services/metaService";
import { getFormDefinition } from "@/crm-server/services/formDefinitions";
import { metaFormAnswersDoc } from "@/crm-server/services/leadFieldMapping";
import { placementFor, metaPipelinePlacement } from "@/lib/crm/bridge";
import { fireTrigger } from "@/crm-server/services/automationEngine";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/meta-leads — Meta verification handshake.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "";
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

/**
 * POST /api/webhooks/meta-leads
 *
 * LIVE path: this is the callback URL configured in the Meta app (verified 2026-09-29).
 * Uses CrmSourceConnection auth + the T7 field map. Each lead is processed on its own: a failure
 * is logged to CrmIntegrationActivity and the request still returns 200, because Meta retries
 * non-2xx deliveries and disables webhooks that keep failing.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    const entries: any[] = body.entry ?? [];
    for (const entry of entries) {
      const pageId = String(entry.id ?? "");

      const connection = await prisma.crmSourceConnection.findFirst({
        where: { source: "meta", metaPageId: pageId, active: true },
      });

      const changes: any[] = entry.changes ?? [];
      for (const change of changes) {
        if (change.field !== "leadgen") continue;
        const leadgenId: string | undefined = change.value?.leadgen_id;
        const inboxUrl: string | undefined = change.value?.inbox_url;

        if (!connection || !connection.metaAppSecret) continue;

        const appSecret = decrypt(connection.metaAppSecret);
        const sigResult = verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
        if (!sigResult.ok) {
          return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
        }

        if (!leadgenId || !connection.metaPageAccessToken) continue;
        try {

        const existing = await prisma.crmLead.findFirst({
          where: { externalLeadId: String(leadgenId) },
          select: { id: true },
        });
        if (existing) continue;

        const pageToken = decrypt(connection.metaPageAccessToken);

        let leadData: Awaited<ReturnType<typeof fetchLeadData>>;
        try {
          leadData = await fetchLeadData(leadgenId, pageToken);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Graph fetch failed";
          const stub = await prisma.crmLead.create({
            data: {
              firstName: `Meta Lead #${leadgenId.slice(-4)}`,
              lastName: "",
              phone: "",
              source: "meta",
              externalLeadId: leadgenId,
              sourceConnectionId: connection.id,
              utmSource: "meta",
              utmMedium: "paid_social",
              adDetail: { leadgenId, pageId, importError: true, errorMessage: message },
              status: "new",
              priority: "normal",
            },
          });
          await fireTrigger("lead_created", stub.id);
          continue;
        }

        const optionLabels = leadData.form_id
          ? await fetchOptionLabels(leadData.form_id, pageToken)
          : {};
        const formDef = await getFormDefinition(leadData.form_id, pageToken);
        const formName = (leadData.form_id ? await getFormName(leadData.form_id, pageToken) : null) ?? formDef?.name ?? null;
        const formAnswers = metaFormAnswersDoc({ fieldData: leadData.field_data, questions: formDef?.questions, formId: leadData.form_id, formName, campaignName: leadData.campaign_name, submittedAt: leadData.created_time });

        const { lead: mapped, custom, hiringCustom } = applyT7FieldMap(
          leadData.field_data ?? [],
          optionLabels,
          formName,
          leadData.campaign_name,
        );

        const platformLabel = leadData.platform
          ? (({ fb: "Facebook", ig: "Instagram", an: "Audience Network", msg: "Messenger" } as Record<string, string>)[leadData.platform.toLowerCase()] ?? leadData.platform)
          : "Meta";
        const otherSourceParts = [platformLabel];
        if (leadData.campaign_name) otherSourceParts.push(leadData.campaign_name);
        if (formName) otherSourceParts.push(formName);
        const otherSource = otherSourceParts.join(" · ");

        const hiring = isHiringForm(formName, leadData.campaign_name);
        // Route non-hiring leads to the matching pipeline by form/campaign keyword.
        const basePlace = hiring
          ? await placementFor("NEW")
          : await metaPipelinePlacement(formName, leadData.campaign_name);
        // Job applicants go to the Hiring pipeline, unassigned, never into the sales round-robin.
        const place = hiring ? { ...basePlace, ...(await getOrCreateHiringPipeline()) } : basePlace;
        await ensureCustomFields();

        const crmLead = await prisma.crmLead.create({
          data: {
            firstName: mapped.firstName || "Meta lead",
            lastName: mapped.lastName ?? "",
            email: mapped.email ?? null,
            phone: mapped.phone ?? "",
            city: mapped.city,
            company: mapped.company ?? null,
            jobTitle: mapped.jobTitle,
            website: mapped.website,
            industry: mapped.industry,
            country: mapped.country,
            requirement: mapped.requirement,
            serviceInterest: mapped.serviceInterest,
            budgetRange: mapped.budgetRange,
            services: mapped.services.length > 0 ? mapped.services : undefined,
            source: "meta",
            otherSource,
            externalLeadId: leadgenId ? String(leadgenId) : null,
            sourceConnectionId: connection.id,
            utmSource: "meta",
            utmMedium: "paid_social",
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
            pipelineId: place.pipelineId,
            pipelineStageId: place.pipelineStageId,
            stageEnteredAt: new Date(),
            status: place.status,
          },
        });

        await saveCustomValues(crmLead.id, { ...custom, ...hiringCustom });

        const notesBody = buildMetaNotesBlock(leadData.field_data ?? [], optionLabels, formName, formDef?.questions);
        await prisma.crmNote.create({
          data: { leadId: crmLead.id, userId: "system", userName: "Meta Lead Ads", body: notesBody },
        });

        if (!hiring) await fireTrigger("lead_created", crmLead.id);
        await prisma.crmActivity.create({
          data: {
            leadId: crmLead.id,
            type: "created",
            description: `Lead "${`${crmLead.firstName} ${crmLead.lastName}`.trim()}" received from Meta Lead Ads.`,
          },
        });
          await prisma.crmSourceConnection.update({
            where: { id: connection.id },
            data: { lastReceivedAt: new Date(), status: "connected", lastError: null },
          });
          await prisma.crmIntegrationActivity.create({
            data: { connectionId: connection.id, source: "meta", status: "processed", leadId: crmLead.id, leadsCreated: 1, processedAt: new Date() },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[meta-leads] lead", leadgenId, "failed:", message);
          await prisma.crmIntegrationActivity
            .create({ data: { connectionId: connection.id, source: "meta", status: "failed", errorMessage: message.slice(0, 500), rawPayload: change.value } })
            .catch(() => {});
        }
      }
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
