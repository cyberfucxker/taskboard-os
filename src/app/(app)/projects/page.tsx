import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { scopedProjectWhere } from "@/lib/scope";
import { canSeeClient } from "@/lib/projectVisibility";
import { ProjectsCommandCenter } from "@/components/projects/ProjectsCommandCenter";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set([
  "SUPER_ADMIN",
  "HR",
  "DEPARTMENT_HEAD",
  "TEAM_LEAD",
  "SENIOR_EXECUTIVE",
  "ACCOUNT_MANAGER",
]);

export default async function ProjectsPage() {
  const session = await guardPage("Projects");
  const scopeWhere = await scopedProjectWhere(session);
  const showClients = canSeeClient(session.user.role);

  const canManage =
    MANAGE_ROLES.has(session.user.role) ||
    session.user.departmentSlug === "leadership";

  const [projects, clients, employees, departments] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null, ...scopeWhere },
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        tasks: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
          },
        },
      },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, role: true, title: true, department: { select: { slug: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ProjectsCommandCenter
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        status: p.status,
        progressPct: p.progressPct,
        description: p.description ?? null,
        clientId: p.clientId,
        ownerId: p.ownerId ?? null,
        startDate: p.startDate ? p.startDate.toISOString() : null,
        endDate: p.endDate ? p.endDate.toISOString() : null,
        clientName: showClients ? (p.client?.name ?? null) : null,
        tasks: p.tasks.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        })),
      }))}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        title: e.title ?? null,
        departmentSlug: e.department?.slug ?? null,
      }))}
      departments={departments}
      clients={showClients ? clients : []}
      manageClients={canManage ? clients : []}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? "You"}
      canManage={canManage}
    />
  );
}
