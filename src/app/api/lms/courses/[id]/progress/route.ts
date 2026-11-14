import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { saveBlockProgress } from "@/lib/lms";

export const dynamic = "force-dynamic";

const schema = z.object({
  blockId: z.string().min(1),
  checks: z.record(z.boolean()).optional(),
  fields: z.record(z.string()).optional(),
  drillAnswers: z.record(z.object({ answer: z.string(), revealed: z.boolean() })).optional(),
  completed: z.boolean().optional(),
  elapsedSec: z.number().int().min(0).optional(),
  currentIdx: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/lms/courses/[id]/progress — autosave one block's checklist ticks,
 * written fields and drill answers for the caller. No time limit is ever
 * enforced here; `elapsedSec` is stored for display only.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("lms.view");
    const body = schema.parse(await req.json());
    const result = await saveBlockProgress(session, params.id, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
