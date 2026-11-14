#!/usr/bin/env npx tsx
/**
 * Fill CrmLead.formAnswers from a Meta Ads Manager lead CSV export (for leads older than the
 * Graph API's ~90-day retention).
 *
 * Export: Meta Ads Manager / Leads Center -> Forms -> pick the form -> Download (CSV).
 * Run once per downloaded file (works with UTF-8 or UTF-16 files, comma or tab separated).
 *
 *   npx tsx scripts/import-meta-leads-csv.ts --file leads.csv                 # dry-run (default)
 *   npx tsx scripts/import-meta-leads-csv.ts --file leads.csv --apply
 *   flags: --overwrite   also replace formAnswers that already exist (default: only leads with none)
 *          --form-name "X"   used when the CSV has no form_name column
 *
 * Matching, per row: (1) lead id (the CSV `id`, "l:" prefix stripped) == CrmLead.externalLeadId or
 * adDetail.leadgenId; else (2) phone (last 10 digits) == phoneNormalized; else (3) email.
 * A phone/email that matches more than one lead is reported as ambiguous and skipped.
 * Only CrmLead.formAnswers is written. Reports matched/updated/unmatched/ambiguous counts.
 */
import fs from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { buildFormAnswersDoc } from '../src/crm-server/services/formAnswers';
import { mappedTargets } from '../src/crm-server/services/leadFieldMapping';

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const apply = argv.includes('--apply');
const overwrite = argv.includes('--overwrite');
const file = opt('--file');
const defaultFormName = opt('--form-name');
if (!file) { console.error('Usage: import-meta-leads-csv.ts --file <leads.csv> [--apply] [--overwrite]'); process.exit(1); }

const prisma = new PrismaClient();

const META_COLUMNS = new Set([
  'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name',
  'is_organic', 'platform', 'lead_status', 'partner_name', 'retailer_item_id', 'inbox_url', 'lead_id',
]);

function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^\uFEFF/, '');
  if (buf[0] === 0xfe && buf[1] === 0xff) { buf.swap16(); return buf.toString('utf16le').replace(/^\uFEFF/, ''); }
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

/** RFC-4180-ish parser: quotes, escaped quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const digits10 = (s: string) => { const d = s.replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };

async function main() {
  console.log(`\nMeta CSV import — ${apply ? 'APPLY' : 'DRY-RUN'}${overwrite ? ' (overwrite)' : ''}\nFile: ${file}`);
  const rows = parseCsv(decode(fs.readFileSync(file!)));
  if (rows.length < 2) { console.log('No data rows.'); return; }
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
  const iId = idx('id') >= 0 ? idx('id') : idx('lead_id');
  const iForm = idx('form_name');
  const iFormId = idx('form_id');
  const iCreated = idx('created_time');
  const qCols = header.map((h, i) => ({ h, i })).filter((c) => c.h && !META_COLUMNS.has(c.h.toLowerCase()));
  console.log(`Rows: ${rows.length - 1}; question columns: ${qCols.length}`);

  const counts = { rows: 0, matchedById: 0, matchedByPhone: 0, matchedByEmail: 0, updated: 0, alreadyHasAnswers: 0, unmatched: 0, ambiguous: 0, noAnswers: 0 };
  const unmatched: string[] = [];

  for (const r of rows.slice(1)) {
    counts.rows += 1;
    const fieldData = qCols.map((c) => ({ name: c.h, values: (r[c.i] ?? '').trim() ? [(r[c.i] ?? '').trim()] : [] }));
    const rawId = iId >= 0 ? (r[iId] ?? '').trim().replace(/^l:/i, '') : '';
    const formName = (iForm >= 0 ? r[iForm]?.trim() : '') || defaultFormName || null;

    let leadId: string | null = null;
    let existing: unknown = null;
    if (rawId) {
      const l = await prisma.crmLead.findFirst({
        where: { OR: [{ externalLeadId: rawId }, { adDetail: { path: ['leadgenId'], equals: rawId } }] },
        select: { id: true, formAnswers: true },
      });
      if (l) { leadId = l.id; existing = l.formAnswers; counts.matchedById += 1; }
    }
    if (!leadId) {
      const phone = digits10(fieldData.find((f) => /phone|mobile/i.test(f.name))?.values[0] ?? '');
      const email = (fieldData.find((f) => /email/i.test(f.name))?.values[0] ?? '').toLowerCase();
      const cand = async (where: Prisma.CrmLeadWhereInput, kind: 'Phone' | 'Email') => {
        const hits = await prisma.crmLead.findMany({ where: { source: 'meta', ...where }, select: { id: true, formAnswers: true }, take: 3 });
        if (hits.length === 1) { leadId = hits[0].id; existing = hits[0].formAnswers; counts[kind === 'Phone' ? 'matchedByPhone' : 'matchedByEmail'] += 1; }
        else if (hits.length > 1) counts.ambiguous += 1;
        return hits.length;
      };
      let n = 0;
      if (phone) n = await cand({ phoneNormalized: { endsWith: phone } }, 'Phone');
      if (!leadId && n === 0 && email) await cand({ emailNormalized: email }, 'Email');
    }
    if (!leadId) { if (!unmatched.length || unmatched.length < 200) unmatched.push(rawId || '(no id)'); counts.unmatched += 1; continue; }
    if (existing && !overwrite) { counts.alreadyHasAnswers += 1; continue; }

    const targets = mappedTargets(fieldData, formName, null);
    const doc = buildFormAnswersDoc({
      source: 'meta',
      fieldData,
      formId: iFormId >= 0 ? r[iFormId]?.trim() || null : null,
      formName,
      submittedAt: iCreated >= 0 ? r[iCreated]?.trim() || null : null,
      mappedTo: (k) => targets[k],
    });
    if (!doc) { counts.noAnswers += 1; continue; }
    (doc as any).recoveredFrom = 'csv';
    // CSV headers are question keys, so the labels are the humanised keys.
    doc.labelsGuessed = true;
    if (apply) await prisma.crmLead.update({ where: { id: leadId }, data: { formAnswers: doc as unknown as Prisma.InputJsonValue } });
    counts.updated += 1;
  }

  console.log('\n' + JSON.stringify(counts, null, 2));
  if (unmatched.length) console.log(`First unmatched ids: ${unmatched.slice(0, 10).join(', ')}`);
  if (!apply) console.log('\nDRY RUN — re-run with --apply to write.');
}

main().catch((e) => { console.error('Fatal:', e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
