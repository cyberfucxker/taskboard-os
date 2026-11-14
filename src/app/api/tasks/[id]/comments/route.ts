import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scopedTaskWhere, type ScopedSession } from "@/lib/scope";
import { sendPushToEmployee } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/tasks/[id]/comments — task comment threads.
 *
 * Visibility follows the same rule as the board: leadership (SUPER_ADMIN /
 * DEPARTMENT_HEAD / TEAM_LEAD) sees any task; everyone else only tasks in
 * their own department, or assigned to / created by them (scopedTaskWhere).
 *
 * A comment immediately:
 *   1. persists to the TaskComment table (the thread's audit log), and
 *   2. drops a Notification row (the in-app bell) for the task's assignees +
 *      creator (excluding the author), plus a best-effort web push.
 */
const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

function view(c: {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  author: { id: string; name: string } | null;
}) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    authorId: c.authorId,
    author: c.author?.name ?? "Unknown",
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(authOptions)) as ScopedSession | null;
    if (!session?.user?.id)
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

    const visible = await prisma.task.findFirst({
      where: { id: params.id, deletedAt: null, ...(await scopedTaskWhere(session)) },
      select: { id: true },
    });
    if (!visible)
      return NextResponse.json({ ok: false, error: "Task not found or not in your scope" }, { status: 403 });

    const comments = await prisma.taskComment.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ ok: true, comments: comments.map(view) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(authOptions)) as ScopedSession | null;
    if (!session?.user?.id)
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

    const { body } = bodySchema.parse(await req.json());

    const task = await prisma.task.findFirst({
      where: { id: params.id, deletedAt: null, ...(await scopedTaskWhere(session)) },
      select: {
        id: true,
        code: true,
        assigneeId: true,
        creatorId: true,
        assignees: { select: { employeeId: true } },
      },
    });
    if (!task)
      return NextResponse.json({ ok: false, error: "Task not found or not in your scope" }, { status: 403 });

    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: session.user.id, body },
    });

    // Notify the task's owner(s) — primary + co-assignees + creator, excluding
    // the commenter themselves. The bell badge updates the next server render.
    const targets = new Set<string>();
    if (task.assigneeId) targets.add(task.assigneeId);
    if (task.creatorId) targets.add(task.creatorId);
    for (const a of task.assignees) if (a.employeeId) targets.add(a.employeeId);
    targets.delete(session.user.id);

    if (targets.size > 0) {
      const authorName = session.user.name ?? "Someone";
      const snippet = body.length > 100 ? body.slice(0, 100) + "…" : body;
      const title = `${authorName} commented on ${task.code}`;
      await prisma.notification.createMany({
        data: [...targets].map((employeeId) => ({
          employeeId,
          title,
          detail: snippet,
          severity: "Info",
          kind: "comment",
        })),
      });
      // Best-effort browser push — no-op unless VAPID keys are configured.
      for (const empId of targets) {
        void sendPushToEmployee(empId, { title, body: snippet, url: `/tasks?task=${task.code}` });
      }
    }

    return NextResponse.json({
      ok: true,
      comment: view({ ...comment, authorId: session.user.id, author: null }),
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}