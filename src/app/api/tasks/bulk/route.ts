import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { changeTaskStatus } from "@/lib/tasks";
import { effectiveCapsForSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/bulk — batch status changes and reassignments from the list
 * view. One request, many tasks. Permission mirror of the single-task rules:
 * leadership (tasks.assign) may edit anything; everyone else is limited to
 * their own tasks (creator / assignee).
 */
const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["status", "reassign"]),
  value: z.string().min(1),
  /** Required when action=status and value=BLOCKED (COO rule). */
  reason: z.string().nullish(),
});

export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const caps = await effectiveCapsForSession(session);
    const body = bulkSchema.parse(await req.json());
    const actorId = session.user.id;
    const canAssign = caps.has("tasks.assign");

    // Fetch the affected tasks + assignees for object-level permission checks.
    const tasks = await prisma.task.findMany({
      where: { id: { in: body.ids }, deletedAt: null },
      select: {
        id: true, code: true, title: true, status: true,
        creatorId: true, assigneeId: true,
        assignees: { select: { employeeId: true } },
      },
    });
    if (tasks.length === 0) {
      return NextResponse.json({ ok: false, error: "No matching tasks" }, { status: 404 });
    }

    let changed = 0;
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const task of tasks) {
      const isInvolved =
        task.creatorId === actorId ||
        task.assigneeId === actorId ||
        task.assignees.some((a) => a.employeeId === actorId);
      const canEdit = canAssign || isInvolved;
      if (!canEdit) {
        results.push({ id: task.id, ok: false, error: "You can only bulk-edit tasks you created or are assigned to." });
        continue;
      }

      try {
        if (body.action === "status") {
          const status = body.value as "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
          if (status === "BLOCKED" && !body.reason?.trim()) {
            results.push({ id: task.id, ok: false, error: "A blocker description is required to move a task to Blocked." });
            continue;
          }
          await changeTaskStatus(task.id, status, actorId, body.reason ?? null);
        } else {
          // reassign → set primary assignee + ensure the join row exists.
          if (!canAssign && body.value !== actorId) {
            results.push({ id: task.id, ok: false, error: "Only leadership can reassign tasks to other people." });
            continue;
          }
          await prisma.$transaction([
            prisma.taskAssignee.upsert({
              where: { taskId_employeeId: { taskId: task.id, employeeId: body.value } },
              create: { taskId: task.id, employeeId: body.value },
              update: {},
            }),
            prisma.task.update({
              where: { id: task.id },
              data: { assigneeId: body.value },
            }),
          ]);
        }
        changed++;
        results.push({ id: task.id, ok: true });
      } catch (e) {
        results.push({ id: task.id, ok: false, error: (e as Error).message });
      }
    }

    return NextResponse.json({ ok: true, changed, results });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}