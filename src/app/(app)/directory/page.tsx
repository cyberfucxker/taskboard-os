import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { effectiveCapsForSession } from "@/lib/scope";
import { DirectoryHub, type DirectoryEmployee } from "@/components/directory/DirectoryHub";

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  const session = await guardPage("Directory");
  // The Nudge action calls /api/control/nudge, which requires hrms.manage —
  // hide the button for everyone else instead of offering an action that
  // silently 403s.
  const caps = await effectiveCapsForSession(session);
  const canNudge = caps.has("hrms.manage");

  const [employees, openSessions] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        department: { select: { id: true, name: true, color: true } },
        manager: { select: { id: true, name: true } },
        _count: {
          select: {
            assignedTasks: {
              where: { deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
            },
          },
        },
      },
    }),
    prisma.taskWorkSession.findMany({
      where: { endedAt: null },
      include: {
        task: { select: { id: true, code: true, title: true } },
      },
    }),
  ]);

  const runningMap = new Map<string, { id: string; code: string; title: string; startedAt: string }>();
  openSessions.forEach((s) => {
    if (s.task) {
      runningMap.set(s.assigneeId, {
        id: s.task.id,
        code: s.task.code,
        title: s.task.title,
        startedAt: s.startedAt.toISOString(),
      });
    }
  });

  const formatted: DirectoryEmployee[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    title: e.title,
    role: e.role,
    status: e.status,
    department: e.department,
    manager: e.manager,
    weeklyCapacityHrs: e.weeklyCapacityHrs,
    openTasksCount: e._count.assignedTasks,
    currentRunningTask: runningMap.get(e.id) ?? null,
  }));

  return <DirectoryHub employees={formatted} canNudge={canNudge} />;
}
