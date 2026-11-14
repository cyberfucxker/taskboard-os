import { prisma } from "@/lib/db";
import { scopedProjectWhere, scopedTaskWhere, type ScopedSession } from "@/lib/scope";

/** Project data-access layer — RBAC enforced internally. */

/** List the projects visible to this session (dept-scoped). */
export async function getProjects(session: ScopedSession) {
  const where = await scopedProjectWhere(session);
  const rows = await prisma.project.findMany({
    where: { deletedAt: null, ...where },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      client: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      _count: {
        select: { tasks: { where: { deletedAt: null, status: { not: "DONE" } } } },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category ?? null,
    status: p.status,
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
    owner: p.owner ? { id: p.owner.id, name: p.owner.name } : null,
    activeTaskCount: p._count.tasks,
  }));
}

/** Full project detail — tasks dept-scoped to the viewer. null if out of scope. */
export async function getProjectById(session: ScopedSession, projectId: string) {
  const accessWhere = await scopedProjectWhere(session);
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null, ...accessWhere },
    include: {
      client: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, tier: true, deliverables: true } },
    },
  });
  if (!project) return null;

  // Being allowed to see the PROJECT does not mean seeing every task on it —
  // a Dev team lead who can open a cross-department project must still only
  // see the project's Dev tasks, not Sales' or HR's.
  const taskWhere = await scopedTaskWhere(session);
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, deletedAt: null, ...taskWhere },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, code: true, title: true, status: true, priority: true, dueLabel: true },
  });

  return {
    id: project.id,
    name: project.name,
    category: project.category ?? (project.service?.name ?? null),
    status: project.status,
    description: project.description,
    progressPct: project.progressPct,
    deliverables: project.service?.deliverables as unknown[] | null,
    client: project.client ? { id: project.client.id, name: project.client.name } : null,
    owner: project.owner ? { id: project.owner.id, name: project.owner.name } : null,
    service: project.service
      ? { id: project.service.id, name: project.service.name, tier: project.service.tier }
      : null,
    tasks,
  };
}