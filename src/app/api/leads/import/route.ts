import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { importLeads, type ConflictPolicy } from "@/lib/leads/importer";
import { LEAD_SOURCES } from "@/lib/leads/normalize";

export const dynamic = "force-dynamic";

const MAX_ROWS = 20000;

const schema = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(MAX_ROWS),
  mapping: z.record(z.string(), z.string()).nullish(),
  conflictPolicy: z.enum(["skip", "update"]).optional(),
  defaultOwnerId: z.string().nullish(),
  defaultSource: z.enum(LEAD_SOURCES as unknown as [string, ...string[]]).nullish(),
  defaultStage: z
    .enum(["NEW", "CONTACTED", "QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"])
    .nullish(),
  skipUnidentifiable: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  fileName: z.string().max(260).nullish(),
});

/**
 * POST /api/leads/import
 *
 * Dry run unless the caller explicitly says otherwise. A migration that
 * rewrites a CRM should not be something you discover was destructive after
 * the fact, so writing requires an explicit dryRun:false.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("crm.manage");
    const body = schema.parse(await req.json());

    const report = await importLeads(body.rows, {
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
      return NextResponse.json(
        { ok: false, error: "Invalid request", issues: err.issues },
        { status: 400 }
      );
    }
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
