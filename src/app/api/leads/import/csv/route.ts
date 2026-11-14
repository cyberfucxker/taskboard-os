import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseDelimited } from "@/lib/leads/csv";
import { buildColumnMap, LEAD_SOURCES } from "@/lib/leads/normalize";
import { importLeads, type ConflictPolicy } from "@/lib/leads/importer";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 20000;

const schema = z.object({
  file: z.string().min(1),
  fileName: z.string().max(260).optional(),
  delimiter: z.string().length(1).optional(),
  mapping: z.record(z.string(), z.string()).nullish(),
  conflictPolicy: z.enum(["skip", "update"]).optional(),
  defaultOwnerId: z.string().nullish(),
  defaultSource: z.enum(LEAD_SOURCES as unknown as [string, ...string[]]).nullish(),
  defaultStage: z
    .enum(["NEW", "CONTACTED", "QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"])
    .nullish(),
  skipUnidentifiable: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  /** Just parse and report the detected columns, without touching leads. */
  inspectOnly: z.boolean().optional(),
});

/**
 * POST /api/leads/import/csv
 *
 * Takes the uploaded file as base64 rather than multipart so the same handler
 * can be called from the importer UI and from a script. Dry run unless
 * dryRun:false is passed explicitly.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("crm.manage");
    const body = schema.parse(await req.json());

    const raw = Buffer.from(body.file, "base64");
    if (raw.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB).` },
        { status: 400 }
      );
    }

    const text = raw.toString("utf8");
    const rows = parseDelimited(text, body.delimiter);

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "No rows found in that file." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { ok: false, error: `That file has ${rows.length} rows; the limit is ${MAX_ROWS}.` },
        { status: 400 }
      );
    }

    const headers = Object.keys(rows[0]);
    const { mapping, unmapped } = buildColumnMap(headers, body.mapping ?? null);

    if (body.inspectOnly) {
      return NextResponse.json({
        ok: true,
        inspect: {
          headers,
          suggestedMapping: mapping,
          unmappedHeaders: unmapped,
          rowCount: rows.length,
          sample: rows.slice(0, 5),
        },
      });
    }

    const report = await importLeads(rows, {
      mapping: body.mapping ?? null,
      conflictPolicy: (body.conflictPolicy ?? "skip") as ConflictPolicy,
      defaultOwnerId: body.defaultOwnerId ?? null,
      defaultSource: (body.defaultSource ?? null) as never,
      defaultStage: (body.defaultStage ?? null) as never,
      skipUnidentifiable: body.skipUnidentifiable ?? true,
      dryRun: body.dryRun ?? true,
      fileName: body.fileName ?? null,
      actorId: session.user.id,
    });

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request", issues: err.issues }, { status: 400 });
    }
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
