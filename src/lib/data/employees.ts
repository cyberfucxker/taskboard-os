import { prisma } from "@/lib/db";
import type { ScopedSession } from "@/lib/scope";

/** Employee data-access layer — RBAC enforced internally. */

/**
 * Full employee profile — header + learning always included; the
 * tasks/projects/clients section is only populated when the viewer is the
 * employee themself, an unrestricted role (SUPER_ADMIN/DEPARTMENT_HEAD/
 * TEAM_LEAD — same three `scopedTaskWhere` already treats as unrestricted),
 * or shares the target's department. Otherwise `workVisible` is false and
 * those arrays come back empty, so the page can render an honest note
 * instead of leaking another department's work.
 */
export async function getEmployeeProfile(session: ScopedSession, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      title: true,
      role: true,
      avatarInitials: true,
      status: true,
      departmentId: true,
      department: { select: { id: true, name: true, color: true } },
      manager: { select: { id: true, name: true } },
      dob: true,
      personalPhone: true,
      personalEmail: true,
      workEmail: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    },
  });
  if (!employee) return null;

  const workVisible =
    session.user.id === employeeId ||
    session.user.role === "SUPER_ADMIN" ||
    session.user.role === "DEPARTMENT_HEAD" ||
    session.user.role === "TEAM_LEAD" ||
    (session.user.departmentId != null && session.user.departmentId === employee.departmentId);

  let tasks: Array<{
    id: string; code: string; title: string; status: string; priority: string;
    dueLabel: string | null; dueDate: Date | null; completedAt: Date | null;
    creator: { id: string; name: string } | null;
    assignees: Array<{ id: string; name: string }>;
  }> = [];
  let projects: Array<{ id: string; name: string; status: string; client: { id: string; name: string } | null }> = [];
  let clients: Array<{ id: string; name: string; health: string }> = [];
  let recentActivity: Array<{ id: string; type: string; occurredAt: Date; payload: unknown }> = [];
  let assignableEmployees: Array<{ id: string; name: string }> = [];
  let departments: Array<{ id: string; name: string }> = [];

  if (workVisible) {
    const taskSelect = {
      id: true, code: true, title: true, status: true, priority: true,
      dueLabel: true, dueDate: true, completedAt: true, updatedAt: true,
      project: { select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } } },
      creator: { select: { id: true, name: true } },
      assignees: { include: { employee: { select: { id: true, name: true } } } },
    } as const;
    const [primaryTasks, coTasks, ownedProjects, clientOwnerships, activity, allEmployees, allDepartments] = await Promise.all([
      prisma.task.findMany({
        where: { assigneeId: employeeId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: taskSelect,
      }),
      prisma.taskAssignee.findMany({
        where: { employeeId, task: { deletedAt: null } },
        take: 20,
        select: { task: { select: taskSelect } },
      }),
      prisma.project.findMany({
        where: { ownerId: employeeId, deletedAt: null },
        select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } },
      }),
      prisma.clientOwner.findMany({
        where: { ownerId: employeeId },
        select: { client: { select: { id: true, name: true, health: true } } },
      }),
      prisma.activity.findMany({
        where: { actorId: employeeId },
        orderBy: { occurredAt: "desc" },
        take: 8,
        select: { id: true, type: true, occurredAt: true, payload: true },
      }),
      prisma.employee.findMany({
        where: { deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);

    const taskMap = new Map<string, (typeof primaryTasks)[number]>();
    for (const t of primaryTasks) taskMap.set(t.id, t);
    for (const ta of coTasks) if (ta.task && !taskMap.has(ta.task.id)) taskMap.set(ta.task.id, ta.task);
    const allTasks = [...taskMap.values()]
      .sort((a, b) => +b.updatedAt - +a.updatedAt)
      .slice(0, 20);
    tasks = allTasks.map((t) => ({
      id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority,
      dueLabel: t.dueLabel, dueDate: t.dueDate, completedAt: t.completedAt,
      creator: t.creator ? { id: t.creator.id, name: t.creator.name } : null,
      assignees: (t.assignees ?? []).map((a) => ({ id: a.employee.id, name: a.employee.name })),
    }));

    const projectMap = new Map<string, { id: string; name: string; status: string; client: { id: string; name: string } | null }>();
    for (const p of ownedProjects) projectMap.set(p.id, { id: p.id, name: p.name, status: p.status, client: p.client });
    for (const t of allTasks) {
      if (t.project) projectMap.set(t.project.id, { id: t.project.id, name: t.project.name, status: t.project.status, client: t.project.client });
    }
    projects = [...projectMap.values()];

    clients = clientOwnerships.map((co) => co.client);
    recentActivity = activity;
    assignableEmployees = allEmployees;
    departments = allDepartments;
  }

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { employeeId },
    include: {
      course: { select: { id: true, slug: true, title: true, content: true } },
      blocks: { select: { completed: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const learning = enrollments.map((e) => {
    const content = e.course.content as unknown as { blocks: Array<{ id: string }> };
    const total = content.blocks?.length ?? 0;
    const done = e.blocks.filter((b) => b.completed).length;
    return {
      enrollmentId: e.id,
      course: { id: e.course.id, slug: e.course.slug, title: e.course.title },
      status: e.status,
      blocksDone: done,
      blocksTotal: total,
    };
  });

  return {
    id: employee.id,
    name: employee.name,
    title: employee.title,
    role: employee.role,
    avatarInitials: employee.avatarInitials,
    status: employee.status,
    department: employee.department,
    manager: employee.manager,
    dob: employee.dob ? employee.dob.toISOString() : null,
    personalPhone: employee.personalPhone,
    personalEmail: employee.personalEmail,
    workEmail: employee.workEmail,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    workVisible,
    tasks,
    projects,
    clients,
    learning,
    recentActivity,
    assignableEmployees,
    departments,
  };
}
