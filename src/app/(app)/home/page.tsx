import { guardPage } from "@/lib/pages";
import { meToday, istDateKey, istDayStart, istDayOfWeek } from "@/lib/time";
import { prisma } from "@/lib/db";
import { getTodayUpdate } from "@/lib/standup";
import { HomeBento, type HomeData, type PlanTask } from "@/components/home/HomeBento";
import { PostSalesDashboard } from "@/components/home/personas/PostSalesDashboard";
import {
  BdeOutreachDashboard,
  PreSalesDashboard,
} from "@/components/home/personas/SalesPersonaDashboards";
import {
  LavFounderDashboard,
  CooDashboard,
  KinjalChiefOfStaffDashboard,
} from "@/components/home/personas/LeadershipPersonaDashboards";
import {
  DeveloperPersonaDashboard,
  DesignerPersonaDashboard,
  MarketingSEOPersonaDashboard,
  HRPersonaDashboard,
} from "@/components/home/personas/ExecutionPersonaDashboards";
import type { NeedsMeItem } from "@/components/home/atoms/DashboardAtoms";

export const dynamic = "force-dynamic";

const WEEKDAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toPlanTask(t: {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  estimateHrs: number | null;
  dueDate: Date | null;
  client: { name: string } | null;
  project: { name: string } | null;
}): PlanTask {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    status: t.status,
    priority: t.priority,
    estimateHrs: t.estimateHrs,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    clientName: t.client?.name ?? null,
    projectName: t.project?.name ?? null,
  };
}

export default async function HomePage() {
  const session = await guardPage("Home");
  const me = session.user.id;
  const userEmail = (session.user.email || "").toLowerCase();
  const userName = session.user.name || "Team Member";
  const userRole = session.user.role || "";
  const now = new Date();
  const dateStr = istDateKey(now);
  const dayStart = istDayStart(now);

  const [init, commitments, wrap, templates, inbox, overdue, doneToday, blocked, unread, rawProjects, allEmployees] =
    await Promise.all([
      meToday(me),
      (prisma as any).todayCommitment.findMany({
        where: { employeeId: me, dateStr },
        orderBy: { slot: "asc" },
      }),
      getTodayUpdate(me),
      prisma.recurringTaskTemplate.findMany({
        where: { isActive: true, OR: [{ assigneeId: me }, { assigneeId: null }] },
        take: 50,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          assigneeId: me,
          creatorId: { not: me },
          status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW"] },
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          priority: true,
          estimateHrs: true,
          dueDate: true,
          client: { select: { name: true } },
          project: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          assigneeId: me,
          status: { not: "DONE" },
          dueDate: { lt: dayStart },
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          priority: true,
          estimateHrs: true,
          dueDate: true,
          client: { select: { name: true } },
          project: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          assigneeId: me,
          status: "DONE",
          completedAt: { gte: dayStart },
        },
        select: { id: true, title: true },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          archivedAt: null,
          assigneeId: me,
          status: { not: "DONE" },
          blocked: true,
        },
        select: { id: true, title: true, blockerReason: true, code: true },
        take: 10,
      }),
      prisma.notification.count({ where: { employeeId: me, read: false } }),
      prisma.project.findMany({
        where: { status: { in: ["ACTIVE", "ONBOARDING", "PAUSED"] } },
        include: {
          client: { select: { name: true } },
          tasks: {
            where: { deletedAt: null, status: { not: "DONE" } },
            select: { id: true, title: true, status: true, blocked: true, blockerReason: true,
              assigneeId: true, assignees: { select: { employeeId: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.employee.findMany({
        
        select: { id: true, name: true, role: true, department: { select: { name: true, slug: true } } },
      }),
    ]);

  const dept = init.employee?.department ?? null;
  const deptSlug = (dept?.slug || "").toLowerCase();
  const deptName = (dept?.name || "").toLowerCase();
  const todayCode = WEEKDAY_CODES[istDayOfWeek(now)];

  const routines = templates
    .filter((t) => {
      const days = (t.scheduledDays ?? []) as string[];
      if (days.length > 0 && !days.includes(todayCode)) return false;
      if (t.assigneeId && t.assigneeId !== me) return false;
      if (t.departmentId && dept && t.departmentId !== dept.id) return false;
      if (t.departmentName && dept && t.departmentName !== dept.name) return false;
      return true;
    })
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      scheduledTime: t.scheduledTime,
      frequency: t.frequency,
      scheduledDays: (t.scheduledDays as string[]) || ["MON", "TUE", "WED", "THU", "FRI"],
      priority: (t.priority as any) || "P2",
    }));

  // Construct Dynamic "Needs Me Now" Items
  const needsMeItems: NeedsMeItem[] = [];

  if (blocked.length > 0) {
    blocked.slice(0, 3).forEach((b) => {
      needsMeItems.push({
        id: `blocked-${b.id}`,
        title: `Blocker Flag (⚑): ${b.title}`,
        context: b.blockerReason || "Waiting on resolution or external dependency",
        type: "CRITICAL_BLOCKER",
        actionLabel: "Resolve Blocker",
      });
    });
  }

  if (overdue.length > 0) {
    overdue.slice(0, 2).forEach((ov) => {
      needsMeItems.push({
        id: `overdue-${ov.id}`,
        title: `Overdue Task: ${ov.title}`,
        context: `Due date elapsed. Action needed.`,
        type: "OVERDUE",
        actionLabel: "Update Status",
      });
    });
  }

  // Determine Persona Matching
  const firstName = (userName.split(" ")[0] || "").toLowerCase();

  // 1. Post-Sales / Project Lead: Peyton
  if (firstName.includes("peyton") || (userRole as any) === "POST_SALES" || deptSlug.includes("post-sales")) {
    const formattedProjects = rawProjects.map((p) => {
      const openTasks = p.tasks.length;
      const blockedTasks = p.tasks.filter((t) => t.blocked).length;
      let health: "GREEN" | "AMBER" | "RED" = "GREEN";
      let healthReason = "All milestones on track";

      if (blockedTasks > 0) {
        health = "RED";
        healthReason = `${blockedTasks} active blocker(s) flagged on tasks`;
      } else if (openTasks > 8) {
        health = "AMBER";
        healthReason = "Heavy backlog awaiting dev capacity";
      }

      return {
        id: p.id,
        name: p.name,
        clientName: p.client?.name || "Direct Client",
        health,
        healthReason,
        activeMilestone: "Core Deliverables & Sprint Execution",
        progressPct: 65,
        openTasksCount: openTasks,
        pendingApprovalsCount: 0,
        blockedIssuesCount: blockedTasks,
        lastUpdateDate: "Today",
        nextSlaDate: "In 2 days",
      };
    });

    return (
      <PostSalesDashboard
        projects={formattedProjects}
        employees={allEmployees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          department: e.department?.name || "General",
        }))}
      />
    );
  }

  // 2. Outreach Desk: Nova / BDE
  if (firstName.includes("nova") || (userRole as any) === "BDE" || userEmail.includes("nova")) {
    return <BdeOutreachDashboard needsMeItems={needsMeItems} />;
  }

  // 3. Pre-Sales Requirement Desk: Kai
  if (firstName.includes("kai") || userEmail.includes("kai")) {
    return <PreSalesDashboard needsMeItems={needsMeItems} />;
  }

  // 4. Closer / Deals to Close: Sage & Skyler
  if (
    firstName.includes("sage") ||
    firstName.includes("skyler") ||
    userEmail.includes("sage") ||
    userEmail.includes("skyler")
  ) {
    // COO 2026-10-06: Sage gets Peyton's command dashboard layout, but strictly
    // projects he is involved in (assigned), with client names redacted (not AM/SUPER_ADMIN).
    const involved = rawProjects.filter((p) =>
      p.tasks.some((t) => t.assigneeId === me || t.assignees.some((a) => a.employeeId === me)),
    );
    const surbhitProjects = involved.map((p) => {
      const openTasks = p.tasks.length;
      const blockedTasks = p.tasks.filter((t) => t.blocked).length;
      let health: "GREEN" | "AMBER" | "RED" = "GREEN";
      let healthReason = "All milestones on track";
      if (blockedTasks > 0) {
        health = "RED";
        healthReason = `${blockedTasks} active blocker(s) flagged on tasks`;
      } else if (openTasks > 8) {
        health = "AMBER";
        healthReason = "Heavy backlog awaiting dev capacity";
      }
      return {
        id: p.id,
        name: p.name,
        clientName: null as string | null,
        health,
        healthReason,
        activeMilestone: "Core Deliverables & Sprint Execution",
        progressPct: 65,
        openTasksCount: openTasks,
        pendingApprovalsCount: 0,
        blockedIssuesCount: blockedTasks,
        lastUpdateDate: "Today",
        nextSlaDate: "In 2 days",
      };
    });
    return (
      <PostSalesDashboard
        titleBadge="Sage \u00b7 Closer"
        projects={surbhitProjects}
        employees={allEmployees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          department: e.department?.name || "General",
        }))}
      />
    );
  }

  // 5. Leadership: Alex (Founder)
  if (firstName.includes("alex") || (userRole as any) === "SUPER_ADMIN" || (userRole as any) === "FOUNDER") {
    return <LavFounderDashboard needsMeItems={needsMeItems} />;
  }

  // 6. Leadership: Jordan (COO)
  if (firstName.includes("jordan") || (userRole as any) === "COO") {
    return <CooDashboard needsMeItems={needsMeItems} projects={rawProjects} />;
  }

  // 7. Leadership: Kit (Chief of Staff)
  if (firstName.includes("kit") || (userRole as any) === "CHIEF_OF_STAFF" || userEmail.includes("kit")) {
    return <KinjalChiefOfStaffDashboard needsMeItems={needsMeItems} />;
  }

  // 8. Creative / UI/UX Design: Lane, Sam, Avery
  if (
    firstName.includes("lane") ||
    firstName.includes("sam") ||
    firstName.includes("avery") ||
    deptSlug.includes("design") ||
    deptSlug.includes("creative") ||
    deptName.includes("design")
  ) {
    return <DesignerPersonaDashboard userName={userName.split(" ")[0]} needsMeItems={needsMeItems} routines={routines} />;
  }

  // 9. SEO & Performance Marketing: Kendall, Sasha, Devon, Harper, Ash, Hayden
  if (
    firstName.includes("kendall") ||
    firstName.includes("sasha") ||
    firstName.includes("devon") ||
    firstName.includes("harper") ||
    firstName.includes("ash") ||
    firstName.includes("hayden") ||
    deptSlug.includes("seo") ||
    deptSlug.includes("marketing") ||
    deptSlug.includes("growth") ||
    deptName.includes("marketing")
  ) {
    const isPerformance = firstName.includes("devon") || firstName.includes("harper");
    return (
      <MarketingSEOPersonaDashboard
        userName={userName.split(" ")[0]}
        roleType={isPerformance ? "PERFORMANCE_ADS" : "SEO"}
        needsMeItems={needsMeItems}
        routines={routines}
      />
    );
  }

  // 10. HR & Talent: Casey
  if (firstName.includes("casey") || deptSlug.includes("hr") || deptName.includes("human resources")) {
    return <HRPersonaDashboard userName={userName.split(" ")[0]} needsMeItems={needsMeItems} routines={routines} />;
  }

  // 11. Engineering / Developers: Parker, Mika, Riley, Nina (or default developer)
  if (
    firstName.includes("parker") ||
    firstName.includes("mika") ||
    firstName.includes("riley") ||
    firstName.includes("nina") ||
    deptSlug.includes("dev") ||
    deptSlug.includes("engineering") ||
    deptName.includes("development")
  ) {
    const workOrders = inbox.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      project: t.project?.name || "Internal",
      priority: t.priority,
      due: t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "Today",
      delegator: "Peyton",
    }));

    return (
      <DeveloperPersonaDashboard
        userName={userName.split(" ")[0]}
        roleTitle="Engineering Pod"
        needsMeItems={needsMeItems}
        routines={routines}
        workOrders={workOrders}
      />
    );
  }

  // Fallback for anyone else: Structured Developer Persona with Work Orders & Routines
  return (
    <DeveloperPersonaDashboard
      userName={userName.split(" ")[0]}
      roleTitle="Team Workspace"
      needsMeItems={needsMeItems}
      routines={routines}
      workOrders={inbox.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        project: t.project?.name || "General",
        priority: t.priority,
        due: t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "Today",
        delegator: "Peyton",
      }))}
    />
  );
}
