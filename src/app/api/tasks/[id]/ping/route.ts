import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/eventlog";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/[id]/ping
 * Sends a "ping for status" signal on a blocked task.
 * Records an activity log entry and returns { ok: true }.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireRole();
  const task = await prisma.task.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, assigneeId: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  await emitEvent({
    type: "TASK_UPDATED",
    actorId: session.user.id,
    entityType: "task",
    entityId: task.id,
    payload: { action: "ping", note: "Pinged for status update" },
    topic: "task.ping",
  });
  return NextResponse.json({ ok: true });
}
