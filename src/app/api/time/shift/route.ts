import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pauseTask } from "@/lib/tasks";
import { effectiveCapsForSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

const shiftSchema = z.object({
  action: z.enum(["pause", "resume"]),
  reason: z.string().max(200).optional().nullable(),
});

/**
 * GET /api/time/shift - returns persisted shift pause state
 * POST /api/time/shift - pauses or resumes the shift
 */
export async function GET() {
  try {
    const session = await requireRole("workspace.access");
    const emp = await prisma.employee.findUnique({
      where: { id: session.user.id },
      select: {
        shiftPaused: true,
        shiftPauseReason: true,
        shiftPausedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      isPaused: emp?.shiftPaused ?? false,
      reason: emp?.shiftPauseReason ?? null,
      pausedAt: emp?.shiftPausedAt?.toISOString() ?? null,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireRole("workspace.access");
    const body = shiftSchema.parse(await req.json());
    const caps = await effectiveCapsForSession(session);

    if (body.action === "pause") {
      const reason = body.reason?.trim() || "Break / Pause";
      const now = new Date();

      // Persist pause in Employee
      await prisma.employee.update({
        where: { id: session.user.id },
        data: {
          shiftPaused: true,
          shiftPauseReason: reason,
          shiftPausedAt: now,
        },
      });

      // Also auto-pause any open task sessions so work stopwatch stops during break
      try {
        await pauseTask("current", session.user.id, caps, reason);
      } catch {
        // Safe to ignore if no task was actively running
      }

      return NextResponse.json({
        ok: true,
        isPaused: true,
        reason,
        pausedAt: now.toISOString(),
      });
    }

    if (body.action === "resume") {
      await prisma.employee.update({
        where: { id: session.user.id },
        data: {
          shiftPaused: false,
          shiftPauseReason: null,
          shiftPausedAt: null,
        },
      });

      return NextResponse.json({
        ok: true,
        isPaused: false,
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
