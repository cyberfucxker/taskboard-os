import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { getClientById } from "@/lib/data/clients";
import { effectiveCapsForSession } from "@/lib/scope";
import { ClientDetail } from "@/components/clients/ClientDetail";
import type { ScopedSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * /clients/[id] — full client detail. The data layer applies RBAC: a
 * non-leadership viewer asking for a client outside their visible scope gets
 * null here, so we render a 404 rather than leaking the entity. Also feeds the
 * new-task/new-project affordances their picker data (employees, departments).
 */
export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  await guardPage("Clients");

  const session = (await getServerSession(authOptions)) as ScopedSession;
  if (!session?.user?.id) redirect("/login");

  const client = await getClientById(session, params.id);
  if (!client) notFound();

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
    <ClientDetail
      data={client}
      employees={employees}
      departments={departments}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? "You"}
      canAssign={caps.has("tasks.assign")}
    />
  );
}