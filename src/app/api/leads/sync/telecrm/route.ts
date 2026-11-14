import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { syncTeleCrmLeads, teleCrmSyncState, readTeleCrmConfig } from "@/lib/leads/telecrm";
import { prisma } from "@/lib/db";
import { recentImportBatches } from "@/lib/leads/importer";

export const dynamic = "force-dynamic";

const schema = z.object({
  maxPages: z.number().int().min(1).max(200).optional(),
  startPage: z.number().int().min(0).optional(),
  dryRun: z.boolean().optional(),
  conflictPolicy: z.enum(["skip", "update"]).optional(),
});

/** GET: is TeleCRM configured, and what did the last sync do. */
export async function GET() {
  try {
    await requireRole("crm.manage");
    const [configured, state, batches] = await Promise.all([
      readTeleCrmConfig().then((c) => ({
        configured: !!c,
        enterpriseId: c?.enterpriseId ?? null,
        baseUrl: c?.baseUrl ?? null,
      })),
      teleCrmSyncState(),
      recentImportBatches(5),
    ]);
    return NextResponse.json({ ok: true, configured, state, batches });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/** POST: run a sync. Dry run unless explicitly told otherwise. */
export async function POST(req: Request) {
  try {
    const session = await requireRole("crm.manage");
    const body = schema.parse(await req.json().catch(() => ({})));
    const result = await syncTeleCrmLeads({
      maxPages: body.maxPages,
      startPage: body.startPage,
      dryRun: body.dryRun ?? true,
      conflictPolicy: body.conflictPolicy,
      actorId: session.user.id,
    });
    return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 400 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
