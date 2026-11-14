import { Suspense } from "react";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { taskView } from "@/lib/tasks";
import { MyWork } from "@/components/tasks/MyWork";

export const dynamic = "force-dynamic";

const WITH = {
  assignee: { select: { id: true, name: true } },
  department: { select: { id: true, name: true, color: true } },
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  subtasks: { orderBy: { order: "asc" } },
  assignees: { include: { employee: { select: { id: true, name: true } } } },
  creator: { select: { id: true, name: true } },
  workSessions: true,
} as const;

/** Open tasks + recently completed, all assigned to (or created by) the viewer. */
export default async function MyWorkPage() {
  const session = await guardPage("My Work");

  const mine = {
    deletedAt: null,
    OR: [
      { assigneeId: session.user.id },
      { assignees: { some: { employeeId: session.user.id } } },
      { creatorId: session.user.id },
    ],
  };

  const [open, done] = await Promise.all([
    prisma.task.findMany({
      where: { ...mine, NOT: { status: "DONE" } },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      take: 200,
      include: WITH,
    }),
    prisma.task.findMany({
      where: { ...mine, status: "DONE" },
      orderBy: { completedAt: "desc" },
      take: 5,
      include: WITH,
    }),
  ]);

  return (
    <Suspense>
      <MyWork
        tasks={open.map((t) => taskView(t))}
        doneTasks={done.map((t) => taskView(t))}
      />
    </Suspense>
  );
}