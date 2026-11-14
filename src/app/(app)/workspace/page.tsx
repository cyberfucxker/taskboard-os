import type { Metadata } from "next";
import { guardPage } from "@/lib/pages";
import { istDayStart, istWeekStart } from "@/lib/time";
import { prisma } from "@/lib/db";
import { EmployeeWorkspace } from "@/components/workspace/EmployeeWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My Workspace" };

/** Personal employee hub — no complex RBAC. Everyone has `workspace.access`,
 *  so this is a universal, self-scoped cockpit: my tasks, my running timer,
 *  my standup, my projects, my week. Quick actions call the existing task API. */
export default async function WorkspacePage() {
  const session = await guardPage("Workspace");
  const me = session.user.id;

  const [emp, tasks, running, todayUpdate, weekSessions] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: me },
      select: {
        id: true,
        name: true,
        role: true,
        title: true,
        department: { select: { id: true, name: true, slug: true, color: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        OR: [
          { assigneeId: me },
          { creatorId: me },
          { assignees: { some: { employeeId: me } } },
        ],
      },
      include: {
        assignees: { include: { employee: { select: { id: true, name: true } } } },
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    (prisma as any).taskWorkSession.findFirst({
      where: { assigneeId: me, endedAt: null },
      include: { task: { select: { id: true, code: true, title: true, startedAt: true } } },
    }),
    prisma.dailyUpdate.findFirst({
      where: {
        employeeId: me,
        date: {
          gte: istDayStart(new Date()),
        },
      },
      orderBy: { date: "desc" },
      select: { id: true, did: true, doing: true, blockedOn: true },
    }),
    (() => {
      const weekStart = istWeekStart(new Date());
      return (prisma as any).taskWorkSession.aggregate({
        where: { assigneeId: me, endedAt: { not: null, gte: weekStart } },
        _sum: { elapsedSec: true },
      });
    })(),
  ]);

  const weekStart = istWeekStart(new Date());

  const weekDone = tasks.filter(
    (t) => t.status === "DONE" && t.completedAt && t.completedAt.getTime() >= weekStart.getTime()
  ).length;

  // My projects — distinct projects referenced by my tasks.
  const seen = new Set<string>();
  const projects: Array<{ id: string; name: string }> = [];
  for (const t of tasks) {
    if (t.projectId && t.project && !seen.has(t.projectId)) {
      seen.add(t.projectId);
      projects.push({ id: t.project.id, name: t.project.name });
    }
  }

  const props = {
    me: {
      id: me,
      name: emp?.name ?? session.user.name ?? "",
      role: emp?.role ?? session.user.role ?? "",
      title: emp?.title ?? null,
      department: emp?.department ?? null,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      status: t.status as "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE",
      priority: t.priority as string,
      dueLabel: t.dueLabel,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      estimateHrs: t.estimateHrs,
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
      client: t.client,
      project: t.project,
      assignees: t.assignees,
    })),
    running: running
      ? {
          id: running.id,
          taskId: running.taskId,
          code: running.task.code,
          title: running.task.title,
          startedAt: running.task.startedAt ? running.task.startedAt.toISOString() : null,
        }
      : null,
    todayUpdate,
    velocity: {
      weekDone,
      weekHours: (((weekSessions as any)._sum.elapsedSec ?? 0) / 3600).toFixed(1),
    },
    projects,
  };

  return <EmployeeWorkspace {...props} />;
}
