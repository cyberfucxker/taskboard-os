import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/focus/tasks — the Focus Block picker's task list (COO 2026-10-06).
 * Session user's own TODO + IN_PROGRESS tasks only (id/code/title/status):
 * no assignee filter needed because the viewer IS the filter. The command
 * palette and board keep their own (scoped) queries; this endpoint stays tiny.
 */
export async function GET() {
  try {
    const session = await requireRole("tasks.view");
    const me = session.user.id;
    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        status: { in: ["TODO", "IN_PROGRESS"] },
        OR: [{ assigneeId: me }, { assignees: { some: { employeeId: me } } }],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: { id: true, code: true, title: true, status: true, description: true },
    });
    return NextResponse.json({ ok: true, userId: me, tasks });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
