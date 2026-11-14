import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { decrypt } from './crypto';
import type { MetaFieldDatum } from './metaService';
import { getFormDefinition } from './formDefinitions';
import {
  metaFormAnswersDoc,
  applyT7FieldMap,
  fetchOptionLabels,
  saveCustomValues,
  ensureCustomFields,
  isHiringForm,
} from './leadFieldMapping';

/**
 * Imports the leads a Meta form already holds.
 *
 * The webhook only ever delivers leads submitted *after* the Page was subscribed, so a page
 * with years of history starts out empty. This walks every form on the Page and pulls what
 * Graph still has (Meta retains lead data for a limited window, so `leads_count` is a
 * lifetime counter and is usually larger than what can actually be fetched).
 *
 * Deliberately does **not** fire `lead_created` automations. Those rules are written for
 * leads arriving now — running them across thousands of historical rows would assign,
 * notify and create follow-up tasks for enquiries that are months old.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;

export interface BackfillProgress {
  formsScanned: number;
  leadsSeen: number;
  imported: number;
  skipped: number;
  failed: number;
}

interface GraphLead {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  platform?: string;
  field_data?: MetaFieldDatum[];
}

async function getPage<T>(url: string): Promise<{ data: T[]; next?: string }> {
  const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT_MS });
  return { data: data?.data ?? [], next: data?.paging?.next };
}

/** Every form on the Page, newest first — including ones with no leads left to fetch. */
async function listForms(pageId: string, token: string): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let url: string | undefined = `${GRAPH}/${pageId}/leadgen_forms?fields=id,name&limit=${PAGE_SIZE}&access_token=${token}`;
  while (url) {
    const page: { data: { id: string; name: string }[]; next?: string } = await getPage(url);
    out.push(...page.data);
    url = page.next;
  }
  return out;
}

export async function backfillMetaLeads(
  connectionId: string,
  onProgress?: (p: BackfillProgress & { form: string }) => void
): Promise<BackfillProgress> {
  const connection = await prisma.crmSourceConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.source !== 'meta') throw new Error('Meta connection not found.');
  if (!connection.metaPageId || !connection.metaPageAccessToken) {
    throw new Error('This connection has no Page linked yet.');
  }

  const token = decrypt(connection.metaPageAccessToken);
  const forms = await listForms(connection.metaPageId, token);

  await ensureCustomFields();

  // One query rather than one per lead: 5k round trips would dominate the runtime.
  const existing = new Set(
    (
      await prisma.crmLead.findMany({
        where: { source: 'meta', externalLeadId: { not: null } },
        select: { externalLeadId: true },
      })
    ).map((l) => l.externalLeadId!)
  );

  const progress: BackfillProgress = { formsScanned: 0, leadsSeen: 0, imported: 0, skipped: 0, failed: 0 };

  for (const form of forms) {
    // Read once per form, not once per lead.
    const optionLabels = await fetchOptionLabels(form.id, token);
    const formDef = await getFormDefinition(form.id, token);
    // Custom answers are written after the bulk insert, so the fast path stays a createMany.
    const pendingCustom: { externalLeadId: string; values: Record<string, string> }[] = [];
    let url: string | undefined =
      `${GRAPH}/${form.id}/leads?fields=id,created_time,ad_id,ad_name,campaign_name,platform,field_data` +
      `&limit=${PAGE_SIZE}&access_token=${token}`;
    let formImported = 0;

    while (url) {
      let page: { data: GraphLead[]; next?: string };
      try {
        page = await getPage<GraphLead>(url);
      } catch {
        // A form whose data Meta no longer serves must not stop the whole run.
        progress.failed += 1;
        break;
      }

      const rows: Prisma.CrmLeadCreateManyInput[] = [];
      for (const lead of page.data) {
        progress.leadsSeen += 1;
        if (existing.has(lead.id)) {
          progress.skipped += 1;
          continue;
        }
        const { lead: mapped, custom, hiringCustom } = applyT7FieldMap(
          lead.field_data ?? [],
          optionLabels,
          form.name,
          lead.campaign_name
        );
        // A lead with neither a phone nor an email cannot be worked, so it is not imported.
        if (!mapped.phone && !mapped.email) {
          progress.skipped += 1;
          continue;
        }
        existing.add(lead.id);
        const combinedCustom = { ...custom, ...hiringCustom };
        if (Object.keys(combinedCustom).length > 0) {
          pendingCustom.push({ externalLeadId: lead.id, values: combinedCustom });
        }

        const platformLabel = lead.platform
          ? (({ fb: 'Facebook', ig: 'Instagram', an: 'Audience Network', msg: 'Messenger' } as Record<string, string>)[lead.platform.toLowerCase()] ?? lead.platform)
          : 'Meta';
        const otherSourceParts = [platformLabel];
        if (lead.campaign_name) otherSourceParts.push(lead.campaign_name);
        if (form.name) otherSourceParts.push(form.name);
        const otherSource = otherSourceParts.join(' · ');

        rows.push({
          firstName: mapped.firstName || 'Meta lead',
          lastName: mapped.lastName ?? '',
          email: mapped.email ?? null,
          phone: mapped.phone ?? '',
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
          formAnswers: (metaFormAnswersDoc({ fieldData: lead.field_data, questions: formDef?.questions, formId: form.id, formName: form.name, campaignName: lead.campaign_name, submittedAt: lead.created_time }) ?? undefined) as any,
          source: 'meta',
          otherSource,
          externalLeadId: lead.id,
          sourceConnectionId: connection.id,
          utmSource: 'meta',
          utmMedium: 'paid_social',
          utmCampaign: lead.campaign_name ?? lead.ad_name ?? undefined,
          status: 'new',
          priority: 'normal',
          // Kept as the submission's own date so reports about when enquiries arrived stay true.
          createdAt: lead.created_time ? new Date(lead.created_time) : undefined,
        });
      }

      if (rows.length > 0) {
        const created = await prisma.crmLead.createMany({ data: rows, skipDuplicates: true });
        progress.imported += created.count;
        formImported += created.count;
      }

      url = page.next;
    }

    if (pendingCustom.length > 0) {
      const ids = new Map(
        (
          await prisma.crmLead.findMany({
            where: { externalLeadId: { in: pendingCustom.map((c) => c.externalLeadId) } },
            select: { id: true, externalLeadId: true },
          })
        ).map((l) => [l.externalLeadId!, l.id])
      );
      for (const entry of pendingCustom) {
        const id = ids.get(entry.externalLeadId);
        if (id) await saveCustomValues(id, entry.values);
      }
    }

    progress.formsScanned += 1;
    if (formImported > 0) {
      await prisma.crmIntegrationActivity.create({
        data: {
          connectionId: connection.id,
          source: 'meta',
          status: 'processed',
          leadsCreated: formImported,
          errorMessage: `Backfill — imported ${formImported} past lead(s) from "${form.name}".`,
          processedAt: new Date(),
        },
      });
    }
    onProgress?.({ ...progress, form: form.name });
  }

  return progress;
}