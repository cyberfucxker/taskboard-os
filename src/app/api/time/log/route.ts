import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { logHours, isProductiveSpan, istMin } from "@/lib/time";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/time/log — manual hours.
 * Body: { taskId?, hours (0.25–24), date? "YYYY-MM-DD" (IST), note?, startTime? "HH:MM" }
 * - taskId set → upsert on TimeLog (on-task manual).
 * - taskId null → ManualTimeLog (off-task).
 * Rejects after-hours spans unless the manual entry is on a task WITH outcome.
 */
const schema = z.object({
  taskId: z.string().nullish(),
  hours: z.number().min(0.25).max(24),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(500).nullish(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
});

export async function POST(req: Request) {
  try {
    const session = await requireRole("workspace.access");
    const body = schema.parse(await req.json());

    // Shift sanity: a manual span should be inside the productive window by
    // default; if startTime given and it falls after 18:30, require a task cwith outcome.
    if (body.startTime) {
      const [h, m] = body.startTime.split(":").map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + body.hours * 60;
      const afterShift = startMin >= 18 * 60 + 30;
      if (afterShift) {
        if (!body.taskId) {
          return NextResponse.json(
            { ok: false, error: "Off-task hours after 18:30 aren't counted — log them on the task it belongs to." },
            { status: 400 }
          );
        }
        const task = await prisma.task.findUnique({ where: { id: body.taskId }, select: { outcome: true } });
        if (!task?.outcome) {
          return NextResponse.json(
            { ok: false, error: "After-hours time counts only when the task has an outcome set." },
            { status: 400 }
          );
        }
      } else if (!isProductiveSpan(startMin, endMin)) {
        return NextResponse.json(
          { ok: false, error: "Time must be logged within the shift window (09:30–18:30, lunch 13:30–14:10 excluded)." },
          { status: 400 }
        );
      }
    }

    const result = await logHours({
      employeeId: session.user.id,
      taskId: body.taskId ?? null,
      hours: body.hours,
      date: body.date ?? undefined,
      note: body.note ?? undefined,
    });
    return NextResponse.json({ ok: true, entry: result.entry });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}