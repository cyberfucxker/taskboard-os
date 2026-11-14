import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { normalizeQuestions, type FormQuestionDef } from './formAnswers';

/**
 * Cache of each Meta lead form's questions (key -> label/type/options), in the form's own order.
 * Stored in CrmFormDefinition so the lead screen can show the question text, not the Meta key.
 * Graph is only called when a form has no row yet or the row is older than the TTL.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
const TTL_MS = 24 * 60 * 60 * 1000;

export interface FormDefinition {
  formId: string;
  name: string | null;
  questions: FormQuestionDef[];
  fetchedAt: Date;
}

/** Reads the form definition from Graph and upserts it. Throws on Graph failure. */
export async function refreshFormDefinition(formId: string, pageAccessToken: string, source = 'meta'): Promise<FormDefinition> {
  const { data } = await axios.get(`${GRAPH}/${formId}`, {
    params: { fields: 'id,name,questions{key,label,type,options}', access_token: pageAccessToken },
    timeout: 25_000,
  });
  const questions = normalizeQuestions(data?.questions);
  const name = data?.name ? String(data.name) : null;
  const row = await prisma.crmFormDefinition.upsert({
    where: { formId },
    create: { formId, source, name, questions: questions as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
    update: { name, questions: questions as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
  });
  return { formId, name: row.name, questions, fetchedAt: row.fetchedAt };
}

/** Cached definition, refreshed when stale. Returns null (never throws) when Graph and cache both fail. */
export async function getFormDefinition(
  formId: string | null | undefined,
  pageAccessToken: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<FormDefinition | null> {
  if (!formId) return null;
  let cached: FormDefinition | null = null;
  try {
    const row = await prisma.crmFormDefinition.findUnique({ where: { formId } });
    if (row) {
      cached = { formId, name: row.name, questions: normalizeQuestions(row.questions), fetchedAt: row.fetchedAt };
      if (!opts.forceRefresh && Date.now() - row.fetchedAt.getTime() < TTL_MS) return cached;
    }
  } catch {
    // table missing (migration not applied) -> fall through to Graph without caching
  }
  try {
    return await refreshFormDefinition(formId, pageAccessToken);
  } catch (err) {
    console.warn('[formDefinitions] graph fetch failed for form', formId, axios.isAxiosError(err) ? err.response?.status : '');
    return cached;
  }
}

/** Lists every lead form on the page (id + name), following Graph paging. */
export async function listPageForms(pageId: string, pageAccessToken: string): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let url: string | undefined = `${GRAPH}/${pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${pageAccessToken}`;
  while (url) {
    const { data }: { data: any } = await axios.get(url, { timeout: 25_000 });
    for (const f of data?.data ?? []) out.push({ id: String(f.id), name: String(f.name ?? '') });
    url = data?.paging?.next;
  }
  return out;
}

/** Refreshes the definition of every form on a page. Returns counts only. */
export async function syncPageFormDefinitions(pageId: string, pageAccessToken: string) {
  const forms = await listPageForms(pageId, pageAccessToken);
  let ok = 0;
  let failed = 0;
  for (const f of forms) {
    try {
      await refreshFormDefinition(f.id, pageAccessToken);
      ok += 1;
    } catch {
      failed += 1;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { total: forms.length, ok, failed };
}
