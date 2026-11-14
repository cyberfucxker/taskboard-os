import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { mapFieldDataToLead, type MetaFieldDatum } from './metaService';

/**
 * Turns a Meta form's answers into a lead, using the mapping an admin configured per form.
 *
 * Mappings live on `LeadSourceConnection.fieldMapping`, keyed by form id because two forms on
 * the same Page ask different questions:
 *
 *   { "<formId>": { "full_name": "firstName", "budget_": "custom:budget" } }
 *
 * A target is either a built-in Lead column or `custom:<key>` for a `LeadCustomField`.
 * Questions with no mapping fall back to the automatic name matching that was there before,
 * so an unconfigured form still produces a usable lead.
 */

// ---------------------------------------------------------------------------
// Option labels
// ---------------------------------------------------------------------------

type OptionLabels = Record<string, Record<string, string>>;

const optionCache = new Map<string, { at: number; labels: OptionLabels }>();
const OPTION_CACHE_TTL_MS = 30 * 60 * 1000;

export async function fetchOptionLabels(formId: string, accessToken: string): Promise<OptionLabels> {
  const cached = optionCache.get(formId);
  if (cached && Date.now() - cached.at < OPTION_CACHE_TTL_MS) return cached.labels;

  const labels: OptionLabels = {};
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v21.0/${formId}?fields=questions{key,options}&access_token=${accessToken}`,
      { timeout: 20_000 }
    );
    const questions: any[] = Array.isArray(data?.questions) ? data.questions : (data?.questions?.data ?? []);
    for (const q of questions) {
      if (!q?.key || !Array.isArray(q.options)) continue;
      const byKey: Record<string, string> = {};
      for (const o of q.options) if (o?.key && o?.value) byKey[o.key] = o.value;
      if (Object.keys(byKey).length > 0) labels[q.key] = byKey;
    }
  } catch {
    // A form we cannot read just keeps the raw keys.
  }

  optionCache.set(formId, { at: Date.now(), labels });
  return labels;
}

/** Lead columns a form answer is allowed to write to. */
export const MAPPABLE_LEAD_FIELDS = [
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'fullName', label: 'Full name (splits into first + last)' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'city', label: 'City' },
  { value: 'company', label: 'Company' },
  { value: 'jobTitle', label: 'Job title' },
  { value: 'website', label: 'Website' },
  { value: 'industry', label: 'Industry' },
  { value: 'country', label: 'Country' },
  { value: 'notes', label: 'Notes' },
] as const;

const BUILT_IN: ReadonlySet<string> = new Set<string>(MAPPABLE_LEAD_FIELDS.map((f) => f.value));

export type FormMapping = Record<string, string>;

export function mappingForForm(fieldMapping: unknown, formId?: string | null): FormMapping {
  if (!fieldMapping || typeof fieldMapping !== 'object' || Array.isArray(fieldMapping)) return {};
  const all = fieldMapping as Record<string, unknown>;
  const forForm = formId ? all[formId] : undefined;
  if (forForm && typeof forForm === 'object' && !Array.isArray(forForm)) return forForm as FormMapping;
  return {};
}

export interface MappedAnswers {
  lead: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    city?: string;
    company?: string;
    jobTitle?: string;
    website?: string;
    industry?: string;
    country?: string;
    notes?: string;
  };
  custom: Record<string, string>;
  unmapped: Record<string, string>;
}

const AUTO_KEYS = new Set([
  'fullname', 'name', 'firstname', 'lastname', 'email',
  'phonenumber', 'phone', 'city', 'companyname', 'company', 'jobtitle',
]);

function autoRecognises(questionName: string): boolean {
  return AUTO_KEYS.has(questionName.toLowerCase().replace(/[^a-z]/g, ''));
}

export function applyFormMapping(
  fieldData: MetaFieldDatum[],
  mapping: FormMapping,
  optionLabels: OptionLabels = {}
): MappedAnswers {
  const auto = mapFieldDataToLead(fieldData);
  const lead: MappedAnswers['lead'] = {
    firstName: auto.firstName,
    lastName: auto.lastName,
    email: auto.email,
    phone: auto.phone,
    city: auto.city,
    company: auto.company,
    jobTitle: auto.jobTitle,
  };
  const custom: Record<string, string> = {};
  const unmapped: Record<string, string> = {};

  for (const answer of fieldData) {
    const byKey = optionLabels[answer.name];
    const value = (answer.values ?? [])
      .filter(Boolean)
      .map((v) => byKey?.[v] ?? v)
      .join(', ')
      .trim();
    if (!value) continue;
    const target = mapping[answer.name];

    if (!target) {
      if (!autoRecognises(answer.name)) unmapped[answer.name] = value;
      continue;
    }
    if (target === 'ignore') continue;

    if (target.startsWith('custom:')) {
      custom[target.slice('custom:'.length)] = value;
      continue;
    }
    if (target === 'fullName') {
      const parts = value.split(/\s+/);
      lead.firstName = parts[0] || lead.firstName;
      lead.lastName = parts.slice(1).join(' ');
      continue;
    }
    if (BUILT_IN.has(target)) {
      (lead as Record<string, unknown>)[target] = value;
    }
  }

  for (const name of Object.keys(mapping)) delete unmapped[name];

  return { lead, custom, unmapped };
}

const STANDARD_CUSTOM_FIELD_LABELS: Record<string, string> = {
  timeline: 'Timeline',
  running_ads: 'Running Ads',
  has_website: 'Has Website',
  preferred_contact_time: 'Preferred Contact Time',
  lab_centers: 'Lab Centers',
  monthly_leads: 'Monthly Leads',
  running_lab: 'Running Lab',
  business_type: 'Business Type',
  app_idea: 'App Idea',
  role: 'Role in Business',
  goals: 'Goals / Objectives',
  whatsapp: 'WhatsApp',
  position: 'Position',
  experience: 'Experience',
  current_ctc: 'Current CTC',
  location_fit: 'Location Fit',
};

export async function saveCustomValues(
  leadId: string,
  values: Record<string, string>,
  tx: Prisma.TransactionClient = prisma
): Promise<number> {
  const keys = Object.keys(values).filter((k) => Boolean(values[k]));
  if (keys.length === 0) return 0;

  let written = 0;
  for (const key of keys) {
    const val = values[key];
    if (!val) continue;
    const label = STANDARD_CUSTOM_FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const field = await tx.crmCustomField.upsert({
      where: { key },
      create: { key, label },
      update: {},
      select: { id: true, key: true },
    });
    await tx.crmCustomValue.upsert({
      where: { leadId_fieldId: { leadId, fieldId: field.id } },
      create: { leadId, fieldId: field.id, value: val },
      update: { value: val },
    });
    written += 1;
  }
  return written;
}

export function unmappedNote(unmapped: Record<string, string>): string | null {
  const entries = Object.entries(unmapped);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('\n');
}

// ============================================================
// T7 Field Map — from BOARD.md spec & Meta Form Definitions
// ============================================================

function normT7(key: string): string {
  return (key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesAny(key: string, ...terms: string[]): boolean {
  const n = normT7(key);
  return terms.some((t) => n.includes(t));
}

export function isHiringForm(formName?: string | null, campaignName?: string | null): boolean {
  const f = (formName ?? '').toLowerCase();
  const c = (campaignName ?? '').toLowerCase();
  if (f.includes('hiring')) return true;
  if (/_leads$/.test(f)) return true;
  if (/^(ba|pm)[ _]/.test(f)) return true;
  if (c.startsWith('hiring')) return true;
  return false;
}

const STANDARD_CUSTOM_FIELD_DEFS: { key: string; label: string }[] = Object.entries(STANDARD_CUSTOM_FIELD_LABELS).map(
  ([key, label]) => ({ key, label })
);

type Db = Prisma.TransactionClient | typeof prisma;

export async function ensureCustomFields(db: Db = prisma): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const def of STANDARD_CUSTOM_FIELD_DEFS) {
    const field = await (db as typeof prisma).crmCustomField.upsert({
      where: { key: def.key },
      create: { key: def.key, label: def.label },
      update: {},
      select: { id: true, key: true },
    });
    map.set(field.key, field.id);
  }
  return map;
}

export interface T7MappedResult {
  lead: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    city?: string;
    company?: string;
    jobTitle?: string;
    website?: string;
    industry?: string;
    country?: string;
    requirement?: string;
    serviceInterest?: string;
    budgetRange?: string;
    services: string[];
  };
  custom: Record<string, string>;
  hiringCustom: Record<string, string>;
  isHiring: boolean;
  unmapped: Record<string, string>;
}

function resolveAnswerValue(answer: MetaFieldDatum | any, optionLabels: OptionLabels): string {
  const key = answer.name || answer.key;
  const byKey = optionLabels[key];
  const rawValues = answer.values ?? (answer.answer !== undefined ? (Array.isArray(answer.answer) ? answer.answer : [answer.answer]) : (answer.value !== undefined ? (Array.isArray(answer.value) ? answer.value : [answer.value]) : []));
  return rawValues
    .filter(Boolean)
    .map((v: string) => byKey?.[v] ?? v)
    .join(', ')
    .trim();
}

export function applyT7FieldMap(
  fieldData: (MetaFieldDatum | any)[],
  optionLabels: OptionLabels = {},
  formName?: string | null,
  campaignName?: string | null,
): T7MappedResult {
  const hiring = isHiringForm(formName, campaignName);
  const lead: T7MappedResult['lead'] = { firstName: '', lastName: '', services: [] };
  const custom: Record<string, string> = {};
  const hiringCustom: Record<string, string> = {};
  const unmapped: Record<string, string> = {};

  for (const answer of fieldData || []) {
    const key = answer.name || answer.key;
    const value = resolveAnswerValue(answer, optionLabels);
    if (!value) continue;

    // Ignore system fields
    if (key === 'inbox_url') continue;

    // Name
    if (key === 'FULL_NAME' || matchesAny(key, 'fullname', 'yourname')) {
      if (!lead.firstName) {
        const parts = value.trim().split(/\s+/);
        lead.firstName = parts[0] ?? '';
        lead.lastName = parts.slice(1).join(' ');
      }
      continue;
    }
    if (key === 'FIRST_NAME' || normT7(key) === 'firstname' || normT7(key) === 'fname') {
      if (!lead.firstName) lead.firstName = value;
      continue;
    }
    if (key === 'LAST_NAME' || normT7(key) === 'lastname' || normT7(key) === 'lname') {
      if (!lead.lastName) lead.lastName = value;
      continue;
    }

    // Phone
    if (key === 'PHONE' || matchesAny(key, 'phone', 'mobilenumber', 'mobile', 'phonenumber', 'workphone')) {
      if (!lead.phone) lead.phone = value;
      continue;
    }
    if (matchesAny(key, 'whatsapp')) {
      if (!lead.phone) lead.phone = value;
      else custom['whatsapp'] = value;
      continue;
    }

    // Email
    if (key === 'EMAIL' || key === 'WORK_EMAIL' || matchesAny(key, 'email', 'emailaddress', 'emailid')) {
      if (!lead.email) lead.email = value;
      continue;
    }

    // Location
    if (key === 'CITY' || matchesAny(key, 'city', 'town')) {
      if (!lead.city) lead.city = value;
      continue;
    }
    if (key === 'COUNTRY' || normT7(key) === 'country') {
      if (!lead.country) lead.country = value;
      continue;
    }
    if (matchesAny(key, 'state', 'located', 'whereareyoucurrentlylocated', 'basedinjaipur', 'onsiteinjaipur', 'comfortableworkingonsite')) {
      if (hiring || matchesAny(key, 'onsiteinjaipur', 'comfortableworkingonsite', 'whereareyoucurrentlylocated')) {
        hiringCustom['location_fit'] = value;
      } else if (!lead.city) {
        lead.city = value;
      }
      continue;
    }

    // Company
    if (key === 'COMPANY_NAME' || matchesAny(key, 'companyname', 'company', 'organisation', 'organization', 'businessname')) {
      if (!lead.company) lead.company = value;
      continue;
    }

    // Website / Social link
    if (key === 'WEBSITE' || matchesAny(key, 'websitelink', 'websiteurl', 'website', 'siteurl', 'domain', 'instagramprofile')) {
      if (!lead.website) lead.website = value;
      continue;
    }

    // Job title / Role
    if (key === 'JOB_TITLE' || matchesAny(key, 'jobtitle', 'designation', 'rolein', 'positionin', 'whatisyourrole', 'roleinthe')) {
      if (!lead.jobTitle) lead.jobTitle = value;
      custom['role'] = value;
      continue;
    }

    // Industry / Business type
    if (matchesAny(key, 'industry', 'typeofbusiness', 'businesstype', 'typeofclothing', 'sector', 'niche', 'bestdescribesyou')) {
      if (!lead.industry) lead.industry = value;
      custom['business_type'] = value;
      continue;
    }

    // Diagnostic / Pathology Lab
    if (matchesAny(key, 'diagnostic', 'pathologylab', 'runningalab', 'runninglab', 'laboperation')) {
      custom['running_lab'] = value;
      continue;
    }

    // Goals / Objectives
    if (matchesAny(key, 'maingoal', 'goal', 'objective', 'lookingtoachieve')) {
      custom['goals'] = value;
      const parts = value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!lead.services.includes(p)) lead.services.push(p);
      }
      if (!lead.serviceInterest && parts[0]) lead.serviceInterest = parts[0];
      continue;
    }

    // App idea / requirements
    if (matchesAny(key, 'appidea', 'mobileapp', 'typeofmobileapp', 'haveanappidea')) {
      custom['app_idea'] = value;
      if (matchesAny(key, 'mobileapp', 'typeofmobileapp')) {
        const parts = value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
        for (const p of parts) {
          if (!lead.services.includes(p)) lead.services.push(p);
        }
        if (!lead.serviceInterest && parts[0]) lead.serviceInterest = parts[0];
      }
      continue;
    }

    // Services / solution / interest
    if (matchesAny(key, 'service', 'services', 'solution', 'needmost', 'lookingfor', 'typeofapp', 'whichservice', 'whichservices')) {
      const parts = value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!lead.services.includes(p)) lead.services.push(p);
      }
      if (!lead.serviceInterest && parts[0]) lead.serviceInterest = parts[0];
      continue;
    }

    // Budget
    if (
      matchesAny(
        key,
        'budget',
        'investment',
        'projectinvestments',
        'plansbudget',
        'approximatebudget',
        'estimatedbudget',
        'monthlymarketingbudget',
        'investmentbudget'
      ) &&
      !matchesAny(key, 'ctc', 'salary', 'currentsalary', 'currentpackage')
    ) {
      if (!lead.budgetRange) lead.budgetRange = value;
      continue;
    }

    // Timeline / readiness
    if (matchesAny(key, 'start', 'planningto', 'readytomake', 'timeline', 'decision', 'implementimprove', 'wanttostart', 'planningtoinvest', 'whendoyouwanttostart')) {
      custom['timeline'] = value;
      continue;
    }

    // Standard custom fields
    if (matchesAny(key, 'runningads', 'runningmeta')) {
      custom['running_ads'] = value;
      continue;
    }
    if (matchesAny(key, 'haveawebsite', 'haswebsite')) {
      custom['has_website'] = value;
      continue;
    }
    if (matchesAny(key, 'contacttime', 'preferredcontact')) {
      custom['preferred_contact_time'] = value;
      continue;
    }
    if (matchesAny(key, 'labcenter')) {
      custom['lab_centers'] = value;
      continue;
    }
    if (matchesAny(key, 'leadspermonth', 'monthlylead')) {
      custom['monthly_leads'] = value;
      continue;
    }

    // Hiring-specific
    if (hiring || matchesAny(key, 'position', 'lookingforjob', 'yearsofexperience', 'currentctc', 'currentsalary')) {
      if (matchesAny(key, 'position', 'whichposition', 'lookingforjob')) {
        hiringCustom['position'] = value;
        continue;
      }
      if (matchesAny(key, 'experience', 'yearsofexperience', 'totalworkexperience')) {
        hiringCustom['experience'] = value;
        continue;
      }
      if (matchesAny(key, 'salary', 'ctc', 'currentctc', 'currentsalary', 'currentpackage')) {
        hiringCustom['current_ctc'] = value;
        continue;
      }
      if (matchesAny(key, 'handlingcustomercomplaints', 'technicalproducts', 'maximummonthlyadvertisingbudget')) {
        hiringCustom[normT7(key).slice(0, 30)] = value;
        continue;
      }
    }

    unmapped[key] = value;
  }

  if (!lead.firstName) lead.firstName = 'Unknown';

  const reqParts: string[] = [];
  if (lead.services.length > 0) reqParts.push(`Need: ${lead.services.join(', ')}`);
  if (custom['running_lab']) reqParts.push(`Lab: ${custom['running_lab']}`);
  if (custom['business_type']) reqParts.push(`Business: ${custom['business_type']}`);
  if (custom['app_idea']) reqParts.push(`App Idea: ${custom['app_idea']}`);
  if (lead.budgetRange) reqParts.push(`Budget: ${lead.budgetRange}`);
  if (custom['timeline']) reqParts.push(`Timeline: ${custom['timeline']}`);
  if (custom['goals'] && !lead.services.length) reqParts.push(`Goals: ${custom['goals']}`);
  if (reqParts.length > 0) lead.requirement = reqParts.join(' · ');

  return { lead, custom, hiringCustom, isHiring: hiring, unmapped };
}

export function buildMetaNotesBlock(
  fieldData: MetaFieldDatum[],
  optionLabels: OptionLabels = {},
  formName?: string | null,
  questions: { key: string; label: string }[] = [],
): string {
  const labelFor = new Map(questions.map((q) => [q.key, q.label]));
  const lines: string[] = [];
  if (formName) lines.push(`Meta form: ${formName}`);
  lines.push('---');
  for (const answer of fieldData) {
    const byKey = optionLabels[answer.name];
    const value = (answer.values ?? []).filter(Boolean).map((v) => byKey?.[v] ?? v).join(', ').trim();
    if (!value) continue;
    const label = labelFor.get(answer.name) ?? answer.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`${label}: ${value}`);
  }
  return lines.join('\n');
}

// ============================================================
// F1: full form answers (every question + answer, in form order)
// ============================================================

import { buildFormAnswersDoc, type FormAnswersDoc, type FormQuestionDef } from './formAnswers';

/**
 * Which lead column / custom field each answer feeds, by running the T7 map on each answer alone.
 * Informational only (the answer is always kept in the list regardless).
 */
export function mappedTargets(
  fieldData: MetaFieldDatum[],
  formName?: string | null,
  campaignName?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of fieldData ?? []) {
    if (!d?.name || out[d.name]) continue;
    const r = applyT7FieldMap([{ name: d.name, values: ['x'] }], {}, formName, campaignName);
    const l = r.lead as Record<string, unknown>;
    let target: string | undefined;
    for (const col of ['email', 'phone', 'city', 'company', 'jobTitle', 'website', 'industry', 'country', 'budgetRange']) {
      if (l[col]) { target = col; break; }
    }
    if (!target && (l.firstName !== 'Unknown' || l.lastName)) target = l.firstName !== 'Unknown' && !l.lastName ? 'firstName' : 'fullName';
    if (!target && r.lead.services.length > 0) target = 'services';
    if (!target) {
      const c = Object.keys({ ...r.custom, ...r.hiringCustom })[0];
      if (c) target = `custom:${c}`;
    }
    if (target) out[d.name] = target;
  }
  return out;
}

/** The stored answers document for a Meta lead (null when it has no answers). */
export function metaFormAnswersDoc(args: {
  fieldData: MetaFieldDatum[] | null | undefined;
  questions?: FormQuestionDef[];
  formId?: string | null;
  formName?: string | null;
  campaignName?: string | null;
  submittedAt?: string | null;
}): FormAnswersDoc | null {
  const targets = mappedTargets(args.fieldData ?? [], args.formName, args.campaignName);
  return buildFormAnswersDoc({
    source: 'meta',
    fieldData: args.fieldData,
    questions: args.questions,
    formId: args.formId,
    formName: args.formName,
    submittedAt: args.submittedAt,
    mappedTo: (k) => targets[k],
  });
}
