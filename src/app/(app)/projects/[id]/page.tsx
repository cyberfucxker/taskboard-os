import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { getProjectById } from "@/lib/data/projects";
import { effectiveCapsForSession } from "@/lib/scope";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import type { ScopedSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * /projects/[id] — full project detail. RBAC enforced in the data layer:
 * out-of-scope requests resolve to null here and render a 404. Also feeds the
 * new-task affordance its picker data (employees, departments).
 */
export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  await guardPage("Projects");

  const session = (await getServerSession(authOptions)) as ScopedSession;
  if (!session?.user?.id) redirect("/login");

  const project = await getProjectById(session, params.id);
  if (!project) notFound();

  const [employees, departments, caps] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    effectiveCapsForSession(session),
  ]);

  return (
    <ProjectDetail
      data={project}
      employees={employees}
      departments={departments}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? "You"}
      canAssign={caps.has("tasks.assign")}
    />
  );
}