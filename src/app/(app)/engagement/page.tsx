import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { scopedProjectWhere } from "@/lib/scope";
import { canSeeClient, dueCountdown } from "@/lib/projectVisibility";
import { EngagementBoard } from "@/components/projects/EngagementBoard";

export const dynamic = "force-dynamic";

/** IST calendar day key (YYYY-MM-DD) for a timestamp. */
function istDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export default async function EngagementPage() {
  // Same audience as Projects — no new slug, no nav churn. Linked from /projects.
  const session = await guardPage("Projects");
  const scopeWhere = await scopedProjectWhere(session);
  const showClients = canSeeClient(session.user.role);
  const todayKey = istDay(Date.now());

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, ...scopeWhere },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { name: true } },
      tasks: {
        where: { deletedAt: null },
        select: { status: true, dueDate: true, updatedAt: true },
      },
    },
  });

  return (
    <EngagementBoard
      rows={projects.map((p) => {
        const open = p.tasks.filter((t) => t.status !== "DONE");
        const lastActiveMs = open.reduce(
          (m, t) => Math.max(m, new Date(t.updatedAt).getTime()),
          0,
        );
        return {
          id: p.id,
          name: p.name,
          clientName: showClients ? (p.client?.name ?? null) : null,
          open: open.length,
          blocked: open.filter((t) => t.status === "BLOCKED").length,
          overdue: open.filter((t) => dueCountdown(t.dueDate)?.overdue ?? false).length,
          lastActiveDay: lastActiveMs > 0 ? istDay(lastActiveMs) : null,
          todayKey,
        };
      })}
    />
  );
}
