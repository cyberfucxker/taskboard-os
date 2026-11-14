import { prisma } from "@/lib/db";
import { scopedClientWhere, scopedTaskWhere, type ScopedSession } from "@/lib/scope";
import { taskView } from "@/lib/tasks";

/**
 * Client data-access layer. Every function takes the session and applies RBAC
 * internally — pages never call Prisma directly for client queries, so scoping
 * can't be accidentally skipped.
 */

export interface ClientSummary {
  id: string;
  name: string;
  projectCount: number;
  activeTaskCount: number;
}

/** List the clients visible to this session (dept-scoped). */
export async function getClients(session: ScopedSession): Promise<ClientSummary[]> {
  const where = await scopedClientWhere(session);
  const rows = await prisma.client.findMany({
    where: { deletedAt: null, ...where },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          projects: { where: { deletedAt: null } },
          tasks: { where: { deletedAt: null, status: { not: "DONE" } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    projectCount: r._count.projects,
    activeTaskCount: r._count.tasks,
  }));
}

/** Full client detail — tasks are dept-scoped to the viewer. null if out of scope. */
export async function getClientById(session: ScopedSession, clientId: string) {
  const accessWhere = await scopedClientWhere(session);
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null, ...accessWhere },
    include: {
      owners: { include: { owner: { select: { id: true, name: true } } } },
      projects: { where: { deletedAt: null }, select: { id: true, name: true, status: true } },
      tasks: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          assignee: { select: { id: true, name: true } },
          department: { select: { id: true, name: true, color: true } },
          subtasks: { orderBy: { order: "asc" } },
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          assignees: { include: { employee: { select: { id: true, name: true } } } },
          workSessions: true,
        },
      },
    },
  });
  if (!client) return null;

  // Dept-scope the task list for non-leadership viewers.
  const taskWhere = await scopedTaskWhere(session);
  const scopedTasks = Object.keys(taskWhere).length
    ? client.tasks.filter((t) => {
        if (!t.departmentId && !t.assigneeId && !t.creatorId) return true; // orphan — show
        const scope = taskWhere as { OR?: unknown[] };
        if (!scope.OR) return true;
        const inside = scope.OR
          .map((o) => o as { departmentId?: string; assigneeId?: string; creatorId?: string })
          .some((o) =>
            (o.departmentId && t.departmentId === o.departmentId) ||
            (o.assigneeId && (t.assigneeId === o.assigneeId)) ||
            (o.assigneeId && t.assignees.some((a) => a.employeeId === o.assigneeId)) ||
            (o.creatorId && t.creatorId === o.creatorId)
          );
        return inside;
      })
    : client.tasks;

  return {
    id: client.id,
    name: client.name,
    industry: client.industry,
    region: client.region,
    tier: client.tier,
    health: client.health,
    description: client.description,
    owners: (client.owners ?? []).map((o) => o.owner),
    projects: client.projects,
    tasks: scopedTasks.map((t) => taskView(t)),
  };
}