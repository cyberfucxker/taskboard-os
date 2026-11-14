import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { answerCheckin } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkin/answer — interval completion check-in.
 * Body: { taskId, done: boolean, outcome?: string, reason?: string }
 * - done=true → marks the task DONE with outcome, closes the open session, clears the check-in.
 * - done=false → increments the "not done" streak; at 3 consecutive it starts asking for a reason.
 */
const schema = z.object({
  taskId: z.string().min(1),
  done: z.boolean(),
  outcome: z.string().max(2000).nullish(),
  reason: z.string().max(500).nullish(),
});

export async function POST(req: Request) {
  try {
    const session = await requireRole("workspace.access");
    const body = schema.parse(await req.json());
    const result = await answerCheckin({
      employeeId: session.user.id,
      taskId: body.taskId,
      done: body.done,
      outcome: body.outcome ?? undefined,
      reason: body.reason ?? undefined,
    });
    return NextResponse.json(result); // already { ok: true, action, ... }
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}