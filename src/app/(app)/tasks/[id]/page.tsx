import { notFound } from "next/navigation";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { taskView } from "@/lib/tasks";
import { scopedTaskWhere, effectiveCapsForSession } from "@/lib/scope";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";

export const dynamic = "force-dynamic";

/**
 * /tasks/[id] — one task as a full page. `id` is the task id or its short code
 * (TSK-123), so the link is shareable in chat. Same guard and visibility scope
 * as /tasks and GET /api/tasks/[id]: if the viewer may not see the task, it
 * simply is not found.
 */
export default async function TaskPage({ params }: { params: { id: string } }) {
  const session = await guardPage("Tasks");
  const caps = await effectiveCapsForSession(session);
  const scope = await scopedTaskWhere(session);
  const key = decodeURIComponent(params.id);

  const task = await prisma.task.findFirst({
    where: { deletedAt: null, AND: [{ OR: [{ id: key }, { code: key }] }, scope] },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, color: true } },
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      subtasks: { orderBy: { order: "asc" } },
      assignees: { include: { employee: { select: { id: true, name: true } } } },
      workSessions: true,
    },
  });
  if (!task) notFound();

  const [comments, activity, employees] = await Promise.all([
    prisma.taskComment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.activity.findMany({
      where: { entityType: "task", entityId: task.id },
      orderBy: { occurredAt: "desc" },
      take: 60,
      include: { actor: { select: { id: true, name: true } } },
    }),
    prisma.employee.findMany({
      where: { status: { in: ["ACTIVE", "PROBATION"] }, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <TaskDetail
      task={taskView(task)}
      comments={comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        authorId: c.authorId,
        author: c.author?.name ?? "Unknown",
      }))}
      activity={activity.map((a) => ({
        id: a.id,
        type: a.type,
        actor: a.actor?.name ?? null,
        actorId: a.actor?.id ?? null,
        at: a.occurredAt.toISOString(),
        payload: a.payload,
      }))}
      employees={employees}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? "You"}
      currentUserRole={session.user.role}
      canAssign={caps.has("tasks.assign")}
    />
  );
}
