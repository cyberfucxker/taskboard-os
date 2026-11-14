import { prisma } from "@/lib/db";
import type { LeadSource, LeadStage, Prisma } from "@prisma/client";
import { crmSourceFor, placementFor } from "@/lib/crm/bridge";
import {
  buildColumnMap,
  hasIdentityColumn,
  identityKeys,
  nameParts,
  parseRow,
  phoneKeys,
  emailNormalized,
  type ParsedRow,
} from "./normalize";

export type ConflictPolicy = "skip" | "update";

export interface ImportOptions {
  /** Explicit header -> field mapping from the admin. Anything unmapped is guessed. */
  mapping?: Record<string, string> | null;
  conflictPolicy?: ConflictPolicy;
  defaultOwnerId?: string | null;
  defaultSource?: LeadSource | null;
  defaultStage?: LeadStage | null;
  /** Treat a row with no email and no phone as a skip rather than importing it blind. */
  skipUnidentifiable?: boolean;
  dryRun?: boolean;
  fileName?: string | null;
  actorId?: string | null;
}

export type RowOutcome = "new" | "updated" | "duplicate" | "skipped";

export interface RowResult {
  row: number;
  outcome: RowOutcome;
  name: string;
  email: string | null;
  phone: string | null;
  reason?: string;
  leadId?: string;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  duplicates: number;
  skipped: number;
  headers: string[];
  mapping: Record<string, string>;
  unmappedHeaders: string[];
  rows: RowResult[];
  /** Anything an admin should look at before trusting this import. */
  warnings: string[];
  batchId: string | null;
}

/**
 * Import leads from parsed rows (CSV headers or a TeleCRM payload).
 *
 * Two things here are deliberate and were the source of real bugs in the
 * The legacy CRM importer this replaces:
 *
 * 1. Matching a phone number normalises BOTH sides. The old code stripped
 *    formatting from the incoming number and then compared it to the stored
 *    number verbatim, so `+91 99999 88888` never matched an existing
 *    `9999988888` and the same person was imported twice.
 * 2. Dedupe inside the file is tracked by the same key as dedupe against the
 *    database, so a file listing someone twice imports them once.
 *
 * Writes go through `prisma.$transaction` in chunks rather than row by row:
 * a 5,000-row TeleCRM history is 5,000 round trips otherwise, and a failure
 * halfway through would leave a half-imported migration with no record of it.
 */
export async function importLeads(
  rows: Record<string, string>[],
  opts: ImportOptions = {}
): Promise<ImportReport> {
  const headers = rows.length
    ? Object.keys(rows[0])
    : [];
  const { mapping, unmapped } = buildColumnMap(headers, opts.mapping);
  const policy: ConflictPolicy = opts.conflictPolicy ?? "skip";
  const skipUnidentifiable = opts.skipUnidentifiable ?? true;

  const warnings: string[] = [];
  if (unmapped.length) {
    warnings.push(
      `${unmapped.length} column(s) were not recognised and ignored: ${unmapped.join(", ")}`
    );
  }
  if (!hasIdentityColumn(mapping)) {
    throw new Error(
      "No usable columns found. Map at least one of Name, Email or Phone before importing."
    );
  }

  // ---- Pass 1: parse and de-duplicate within the file -------------------
  const parsed: { index: number; row: ParsedRow }[] = [];
  const seen = new Map<string, number>();
  const results: RowResult[] = new Array(rows.length);
  const duplicateInFile = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const p = parseRow(rows[i], mapping);
    const firstReal = (p.emailNorm || p.phoneKeys.length > 0);
    if (!firstReal && skipUnidentifiable) {
      results[i] = {
        row: i + 1,
        outcome: "skipped",
        name: p.name,
        email: p.email,
        phone: p.phone,
        reason: p.problems[0] ?? "No email or phone to identify this lead.",
      };
      continue;
    }

    // Same identity twice in one file: keep the first, report the rest.
    const keys = identityKeys(p.emailNorm, p.phoneKeys);
    const clash = keys.find((k) => seen.has(k));
    if (clash) {
      duplicateInFile.add(i);
      results[i] = {
        row: i + 1,
        outcome: "duplicate",
        name: p.name,
        email: p.email,
        phone: p.phone,
        reason: `Same person as row ${(seen.get(clash) ?? i) + 1} of this file.`,
      };
      continue;
    }
    for (const k of keys) seen.set(k, i);
    parsed.push({ index: i, row: p });
  }

  // ---- Pass 2: one batched lookup for every candidate identity -----------
  const emailNeedles = [...new Set(parsed.map((p) => p.row.emailNorm).filter((v): v is string => !!v))];
  const phoneNeedles = [...new Set(parsed.flatMap((p) => p.row.phoneKeys))];

  const existing = new Map<string, { id: string }>();
  if (emailNeedles.length || phoneNeedles.length) {
    // phoneNormalized holds any one of the phoneKeys we computed, so matching
    // on `in` catches the stored number under a different formatting.
    // The CRM (ported from the legacy CRM) has no soft delete on leads — a deleted lead is gone,
    // so there is no deletedAt to filter on here.
    const found = await prisma.crmLead.findMany({
      where: {
        OR: [
          ...(emailNeedles.length ? [{ emailNormalized: { in: emailNeedles } }] : []),
          ...(phoneNeedles.length ? [{ phoneNormalized: { in: phoneNeedles } }] : []),
        ],
      },
      select: { id: true, emailNormalized: true, phoneNormalized: true },
    });
    for (const l of found) {
      if (l.emailNormalized) existing.set(`e:${l.emailNormalized}`, l);
      if (l.phoneNormalized) existing.set(`p:${l.phoneNormalized}`, l);
    }
  }

  const matchFor = (p: ParsedRow): { id: string } | null => {
    if (p.emailNorm) {
      const hit = existing.get(`e:${p.emailNorm}`);
      if (hit) return hit;
    }
    for (const k of p.phoneKeys) {
      const hit = existing.get(`p:${k}`);
      if (hit) return hit;
    }
    return null;
  };

  // ---- Pass 3: write -----------------------------------------------------
  const toCreate: { index: number; p: ParsedRow }[] = [];
  const toUpdate: { index: number; p: ParsedRow; leadId: string }[] = [];

  for (const { index, row: p } of parsed) {
    const hit = matchFor(p);
    if (!hit) {
      toCreate.push({ index, p });
      continue;
    }
    if (policy === "update") {
      toUpdate.push({ index, p, leadId: hit.id });
      continue;
    }
    results[index] = {
      row: index + 1,
      outcome: "duplicate",
      name: p.name,
      email: p.email,
      phone: p.phone,
      reason: "Already in TaskBoard (matched on email or phone).",
      leadId: hit.id,
    };
  }

  const dryRun = opts.dryRun ?? false;
  const CHUNK = 200;

  if (!dryRun) {
    for (let c = 0; c < toCreate.length; c += CHUNK) {
      const slice = toCreate.slice(c, c + CHUNK);
      await prisma.$transaction(async (tx) => {
        for (const { index, p } of slice) {
          const { firstName, lastName } = nameParts(p.name);
          const place = await placementFor(p.stage ?? opts.defaultStage ?? "NEW", tx);
          const source = p.source ?? opts.defaultSource ?? "IMPORTED";
          const via = source === "TELECRM" ? "TeleCRM" : "an import";
          // Anything the row carried that has no column of its own becomes the lead's notes
          // rather than being dropped.
          const notes = [p.notes, p.nextStep ? `Next step: ${p.nextStep}` : null, ...p.problems.map((x) => `Import note: ${x}`)]
            .filter(Boolean)
            .join("\n");
          const created = await tx.crmLead.create({
            data: {
              firstName,
              lastName,
              company: p.company && p.company !== "Unknown" ? p.company : null,
              email: p.email,
              emailNormalized: p.emailNorm,
              // The CRM requires a phone column; an email-only lead stores it empty.
              phone: p.phone ?? "",
              phoneNormalized: p.phoneKeys[0] ?? null,
              city: p.city,
              source: crmSourceFor(source),
              pipelineId: place.pipelineId,
              pipelineStageId: place.pipelineStageId,
              stageEnteredAt: new Date(),
              status: place.status,
              leadScore: p.score ?? 0,
              assignedUserId: opts.defaultOwnerId ?? null,
              notes: notes || null,
              createdAt: p.createdAt ?? new Date(),
            } as Prisma.CrmLeadUncheckedCreateInput,
          });
          await tx.crmActivity.create({
            data: {
              leadId: created.id,
              type: "created",
              description: `Lead "${`${firstName} ${lastName}`.trim()}" created from ${via}.`,
              userId: opts.actorId ?? null,
            },
          });
          results[index] = {
            row: index + 1,
            outcome: "new",
            name: `${created.firstName} ${created.lastName}`.trim(),
            email: created.email,
            phone: created.phone || null,
            leadId: created.id,
          };
        }
      });
    }

    for (let c = 0; c < toUpdate.length; c += CHUNK) {
      const slice = toUpdate.slice(c, c + CHUNK);
      await prisma.$transaction(async (tx) => {
        for (const { index, p, leadId } of slice) {
          const current = await tx.crmLead.findUniqueOrThrow({ where: { id: leadId } });
          const filled = await tx.crmLead.update({
            where: { id: leadId },
            data: buildFillOnlyUpdate(p, current),
          });
          results[index] = {
            row: index + 1,
            outcome: "updated",
            name: `${filled.firstName} ${filled.lastName}`.trim(),
            email: filled.email,
            phone: filled.phone || null,
            leadId: filled.id,
            reason: "Filled missing details on an existing lead.",
          };
        }
      });
    }
  } else {
    for (const { index, p } of toCreate) {
      results[index] = {
        row: index + 1,
        outcome: "new",
        name: p.name,
        email: p.email,
        phone: p.phone,
        reason: p.problems[0],
      };
    }
    for (const { index, p, leadId } of toUpdate) {
      results[index] = {
        row: index + 1,
        outcome: "updated",
        name: p.name,
        email: p.email,
        phone: p.phone,
        leadId,
        reason: "Would fill missing details on an existing lead.",
      };
    }
  }

  const created = results.filter((r) => r?.outcome === "new").length;
  const updated = results.filter((r) => r?.outcome === "updated").length;
  const duplicates = results.filter((r) => r?.outcome === "duplicate").length;
  const skipped = results.filter((r) => r?.outcome === "skipped").length;

  // A dry run must not leave a row behind that looks like a real import.
  const batchId = dryRun
    ? null
    : (
        await prisma.leadImportBatch.create({
          data: {
            source: opts.defaultSource === "TELECRM" ? "TELECRM" : "CSV",
            fileName: opts.fileName ?? null,
            totalRows: rows.length,
            importedRows: created,
            updatedRows: updated,
            duplicateRows: duplicates,
            skippedRows: skipped,
            mapping: mapping as Prisma.InputJsonValue,
            conflictPolicy: policy,
            dryRun: false,
            status: "completed",
            createdById: opts.actorId ?? null,
            finishedAt: new Date(),
          },
        })
      ).id;

  return {
    dryRun,
    total: rows.length,
    created,
    updated,
    duplicates,
    skipped,
    headers,
    mapping,
    unmappedHeaders: unmapped,
    rows: results.filter(Boolean),
    warnings,
    batchId,
  };
}

/**
 * Update payload for an "update" import: only writes fields the incoming row
 * actually had, and only into blanks. Importing a 3-year-old spreadsheet over
 * the top of a lead a rep has been working for a week must not undo that.
 */
function buildFillOnlyUpdate(
  p: ParsedRow,
  current: { firstName: string; email: string | null; phone: string; company: string | null; city: string | null; leadScore: number; notes: string | null }
): Prisma.CrmLeadUncheckedUpdateInput {
  const set: Prisma.CrmLeadUncheckedUpdateInput = {};
  if (p.name && p.name !== "Unknown" && !current.firstName) Object.assign(set, nameParts(p.name));
  if (p.email && p.emailNorm && !current.email) {
    set.email = p.email;
    set.emailNormalized = p.emailNorm;
  }
  if (p.phone && p.phoneKeys.length && !current.phone) {
    set.phone = p.phone;
    set.phoneNormalized = p.phoneKeys[0];
  }
  if (p.company && p.company !== "Unknown" && !current.company) set.company = p.company;
  if (p.city && !current.city) set.city = p.city;
  if (p.score != null && !current.leadScore) set.leadScore = p.score;
  if (p.nextStep && !current.notes) set.notes = `Next step: ${p.nextStep}`;
  return set;
}

/** Backfill normalised columns for leads created before the migration. */
export async function backfillNormalized(): Promise<{ scanned: number; updated: number }> {
  const leads = await prisma.crmLead.findMany({
    where: { OR: [{ phoneNormalized: null }, { emailNormalized: null }] },
    select: { id: true, phone: true, email: true, phoneNormalized: true, emailNormalized: true },
  });
  let updated = 0;
  for (const l of leads) {
    const pn = l.phoneNormalized ?? phoneKeys(l.phone)[0] ?? null;
    const en = l.emailNormalized ?? emailNormalized(l.email);
    if (pn === l.phoneNormalized && en === l.emailNormalized) continue;
    await prisma.crmLead.update({
      where: { id: l.id },
      data: { phoneNormalized: pn, emailNormalized: en },
    });
    updated++;
  }
  return { scanned: leads.length, updated };
}

export async function recentImportBatches(limit = 10) {
  return prisma.leadImportBatch.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}
