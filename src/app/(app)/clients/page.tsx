import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { scopedClientWhere, scopedTaskWhere } from "@/lib/scope";
import { ClientsView } from "@/components/clients/ClientsView";
import type { ClientDetail } from "@/components/clients/ClientDetailDrawer";

export const dynamic = "force-dynamic";

/**
 * Clients page — every client is an entity with owners, projects and tasks,
 * all reachable by clicking the client name. The old /deals page is replaced by
 * this; the route slug "Clients" is kept as the access-grant key for backward
 * compat with the Access page and pageAccess grants.
 */
export default async function ClientsPage() {
  const session = await guardPage("Clients");
  const scopeWhere = await scopedClientWhere(session);
  // Being allowed to see a CLIENT (because your department has one task on
  // it) never meant seeing every task on that client — apply the same
  // department scope to the tasks list itself, mirroring getClientById.
  const taskScopeWhere = await scopedTaskWhere(session);

  const clients = await prisma.client.findMany({
    where: { deletedAt: null, ...scopeWhere },
    orderBy: { name: "asc" },
    include: {
      owners: { include: { owner: { select: { id: true, name: true } } } },
      projects: { where: { deletedAt: null }, select: { id: true, name: true, status: true } },
      tasks: {
        where: { deletedAt: null, ...taskScopeWhere },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true, code: true, title: true, status: true, priority: true, dueLabel: true,
          assignee: { select: { name: true } },
        },
      },
    },
  });

  const view: ClientDetail[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    region: c.region,
    tier: c.tier,
    health: c.health,
    description: c.description,
    owners: (c.owners ?? []).map((o) => o.owner),
    projects: (c.projects ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status })),
    tasks: (c.tasks ?? []).map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueLabel: t.dueLabel,
      assignee: t.assignee?.name ?? null,
    })),
  }));

  return <ClientsView clients={view} />;
}