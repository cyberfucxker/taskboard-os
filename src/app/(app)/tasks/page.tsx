import { Suspense } from "react";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { taskView } from "@/lib/tasks";
import { scopedTaskWhere, effectiveCapsForSession } from "@/lib/scope";
import { projectVisibleTo, canSeeClient } from "@/lib/projectVisibility";
import {
  WorkCommandCenter,
  type CommandProject,
} from "@/components/tasks/WorkCommandCenter";
import type { TaskView } from "@/components/tasks/types";

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

/** IST Monday..Sunday window (as day keys) containing now. */
function istWeekKeys(nowMs: number): { start: string; end: string } {
  const wd = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(new Date(nowMs));
  const offset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  const dayMs = 86_400_000;
  const todayStartUtc = Date.parse(istDay(nowMs) + "T00:00:00Z");
  const monday = todayStartUtc - Math.max(0, offset) * dayMs;
  const sunday = monday + 6 * dayMs;
  const key = (ms: number) => istDay(ms);
  return { start: key(monday), end: key(sunday) };
}

export default async function TasksPage() {
  const session = await guardPage("Tasks");
  const caps = await effectiveCapsForSession(session);
  const canAssign = caps.has("tasks.assign");
  const leadership = caps.has("board.view");
  const showClients = canSeeClient(session.user.role);

  // Department slug lives in the JWT; fall back to a DB read if ever missing.
  let deptSlug: string | null = session.user.departmentSlug ?? null;
  const deptId: string | null = session.user.departmentId ?? null;
  if (!deptSlug && deptId) {
    const d = await prisma.department.findUnique({
      where: { id: deptId },
      select: { slug: true },
    });
    deptSlug = d?.slug ?? null;
  }
  const myDept = await (async () => {
    if (!deptId) return null;
    const d = await prisma.department.findUnique({
      where: { id: deptId },
      select: { name: true },
    });
    return d?.name ?? null;
  })();

  const where = await scopedTaskWhere(session);
  const [tasks, employees, departments, projects, clients] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, archivedAt: null, ...where },
      orderBy: [{ createdAt: "desc" }],
      take: 2000,
      include: {
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, color: true } },
        subtasks: { orderBy: { order: "asc" } },
        client: { select: { id: true, name: true } },
        assignees: { include: { employee: { select: { id: true, name: true, department: { select: { name: true } } } } } },
        workSessions: true,
      },
    }),
    prisma.employee.findMany({
      where: { status: { in: ["ACTIVE", "PROBATION"] }, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, color: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        clientId: true,
        client: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const taskViews: TaskView[] = tasks.map((t) => taskView(t));
  // Client names never reach viewers who may not see them (also stripped from rows).
  const safeViews: TaskView[] = showClients
    ? taskViews
    : taskViews.map((t) => ({ ...t, clientName: null }));

  // Group scoped tasks by project for the visibility rule + cards.
  const byProject = new Map<string, TaskView[]>();
  const unlinked: TaskView[] = [];
  for (const t of safeViews) {
    if (t.projectId) {
      const arr = byProject.get(t.projectId) ?? [];
      arr.push(t);
      byProject.set(t.projectId, arr);
    } else {
      unlinked.push(t);
    }
  }

  const me = session.user.id;
  const visibleProjects: CommandProject[] = [];
  for (const p of projects) {
    const ptasks = byProject.get(p.id) ?? [];
    const visible =
      leadership ||
      projectVisibleTo(
        {
          tasks: ptasks.map((t) => ({
            id: t.id,
            assigneeIds: [
              ...(t.assigneeId ? [t.assigneeId] : []),
              ...t.assignees.map((a) => a.id),
            ],
          })),
          category: p.category,
        },
        { id: me, deptSlug, leadership },
      );
    // Leadership sees every project even with zero loaded tasks; everyone else
    // only projects that survived visibility (empty groups carry no signal).
    if (!visible) continue;
    if (!leadership && ptasks.length === 0) continue;
    visibleProjects.push({
      id: p.id,
      name: p.name,
      category: p.category,
      clientName: showClients ? (p.client?.name ?? null) : null,
      tasks: ptasks,
    });
  }

  // KPI definitions (documented, all from the already-scoped set):
  // - open: not DONE and (assigned to me OR in my department)
  // - blocked: BLOCKED in that same base
  // - dueThisWeek: open task with an IST due day inside this Mon..Sun
  // - activeProjects: visible project cards above
  const week = istWeekKeys(Date.now());
  const dayKeyOf = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? null : istDay(ms);
  };
  const mine = (t: TaskView) =>
    t.assignees.some((a) => a.id === me) || t.assigneeId === me;
  const inMyDept = (t: TaskView) => myDept !== null && t.department === myDept;
  const base = safeViews.filter(
    (t) => t.status !== "DONE" && (mine(t) || inMyDept(t)),
  );
  const kpis = {
    open: base.length,
    blocked: base.filter((t) => t.status === "BLOCKED").length,
    dueThisWeek: base.filter((t) => {
      const k = dayKeyOf(t.dueDate);
      return k !== null && k >= week.start && k <= week.end;
    }).length,
    activeProjects: visibleProjects.length,
  };

  // Leadership (board.view) lands on the whole board; everyone else defaults
  // to their own department's pill — same default the old board used.
  const defaultDept = leadership ? "all" : (myDept ?? "all");

  return (
    <Suspense
      fallback={
        <div className="p-4" aria-busy="true" aria-label="Loading tasks">
          <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-raised" />
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-edge bg-raised p-4">
                <div className="mb-3 h-5 w-1/2 animate-pulse rounded bg-hover" />
                {[0, 1, 2].map((r) => (
                  <div key={r} className="mb-2 h-12 animate-pulse rounded-lg bg-hover" />
                ))}
              </div>
            ))}
          </div>
        </div>
      }
    >
      <WorkCommandCenter
        projects={visibleProjects}
        unlinked={unlinked}
        kpis={kpis}
        employees={employees}
        departments={departments}
        clients={showClients ? clients : []}
        allProjects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          clientId: p.clientId,
        }))}
        currentUserId={session.user.id}
        currentUserName={session.user.name ?? "You"}
        canAssign={canAssign}
        defaultDept={defaultDept}
      />
    </Suspense>
  );
}
