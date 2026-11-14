import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/context
 * Autonomous Agency Context Snapshot for the AI gateway AI Agent:
 * Aggregates workload backlog, unassigned tasks, blocked milestones,
 * team utilization, and active client projects.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    const authHeader = req.headers.get("authorization");
    const isApiKey = !!process.env.TASKBOARD_AGENT_KEY && authHeader === `Bearer ${process.env.TASKBOARD_AGENT_KEY}`;
    const isAdmin = (session?.user as any)?.role === "SUPER_ADMIN" || (session?.user as any)?.departmentSlug === "leadership";

    if (!isApiKey && !(session?.user?.id && isAdmin)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const today = istDayStart(new Date());

    const [
      activeEmployees,
      activeProjects,
      pendingTasks,
      unassignedTasks,
      blockedTasks,
      todaySessions,
      allClients,
    ] = await Promise.all([
      prisma.employee.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, role: true, department: true, title: true, email: true },
      }),
      prisma.project.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          clientId: true,
          startDate: true,
          endDate: true,
          client: { select: { id: true, name: true } },
        },
      }),
      prisma.task.findMany({
        where: { status: { in: ["TODO", "IN_PROGRESS"] as any } },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          assigneeId: true,
          clientId: true,
          dueDate: true,
          assignee: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          subtasks: { select: { id: true, title: true, status: true } },
        },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
        take: 100,
      }),
      prisma.task.findMany({
        where: { assigneeId: null, status: "TODO" },
        select: { id: true, title: true, priority: true, category: true, clientId: true },
      }),
      prisma.task.findMany({
        where: { status: "BLOCKED" },
        select: { id: true, title: true, priority: true, category: true, assigneeId: true },
      }),
      (prisma as any).taskWorkSession ? (prisma as any).taskWorkSession.findMany({
        where: { startedAt: { gte: today } },
        select: { employeeId: true, durationSeconds: true },
      }) : [],
      prisma.client.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, industry: true },
      }),
    ]);

    const hoursByEmp: Record<string, number> = {};
    for (const sess of todaySessions) {
      hoursByEmp[sess.employeeId] = (hoursByEmp[sess.employeeId] || 0) + (sess.durationSeconds || 0) / 3600;
    }

    const teamSnapshot = activeEmployees.map(emp => ({
      ...emp,
      hoursLoggedToday: Number((hoursByEmp[emp.id] || 0).toFixed(2)),
      activeTasksCount: pendingTasks.filter(t => t.assigneeId === emp.id).length,
    }));

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      agencyMetrics: {
        totalActiveEmployees: activeEmployees.length,
        totalActiveProjects: activeProjects.length,
        totalActiveClients: allClients.length,
        openTasksCount: pendingTasks.length,
        unassignedTasksCount: unassignedTasks.length,
        blockedTasksCount: blockedTasks.length,
      },
      teamSnapshot,
      projects: activeProjects,
      unassignedTasks,
      blockedTasks,
      topPendingTasks: pendingTasks.slice(0, 30),
      clients: allClients,
    });
  } catch (err: any) {
    console.error("GET /api/agent/context error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to aggregate agency context" }, { status: 500 });
  }
}

/**
 * POST /api/agent/plan-project
 * Autonomous AI Project Deconstruction:
 * Given a client project brief, automatically creates Department Tasks and Subtask Milestones.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const authHeader = req.headers.get("authorization");
    const isApiKey = !!process.env.TASKBOARD_AGENT_KEY && authHeader === `Bearer ${process.env.TASKBOARD_AGENT_KEY}`;
    const isAdmin = (session?.user as any)?.role === "SUPER_ADMIN" || (session?.user as any)?.departmentSlug === "leadership";

    if (!isApiKey && !(session?.user?.id && isAdmin)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { clientId, projectName, brief, departmentBreakdowns = [] } = body;

    if (!projectName || !clientId) {
      return NextResponse.json({ ok: false, error: "Project name and client ID are required" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name: projectName,
        description: brief || "Deconstructed by the AI gateway Autonomous Agency Manager.",
        status: "ACTIVE" as any,
        clientId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    const createdTasks = [];

    for (const dept of departmentBreakdowns) {
      const { category = "DEVELOPMENT", taskTitle, description, priority = "P1", subtasks = [], assigneeId } = dept;

      const task = await prisma.task.create({
        data: {
          
          code: `TSK-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
          projectId: project.id,
          title: taskTitle || `${category} Deliverables for ${projectName}`,
          description: description || `Departmental execution track for ${category}.`,
          category: category as any,
          priority: priority as any,
          status: "TODO",
          clientId,
          assigneeId: assigneeId || null,
        },
      });

      for (const sub of subtasks) {
        const subTitle = typeof sub === "string" ? sub : sub.title;
        const subEstimate = typeof sub === "object" ? sub.estimateHrs || 2.0 : 2.0;
        const subAssigneeId = typeof sub === "object" ? sub.assigneeId : null;

        await (prisma as any).subtask.create({
          data: {
            title: subTitle,
            taskId: task.id,
            completed: false,
            status: "TODO",
            estimateHrs: subEstimate,
            actualHrs: 0,
            assigneeId: subAssigneeId,
          },
        });
      }

      createdTasks.push(task);
    }

    return NextResponse.json({
      ok: true,
      message: `Project '${projectName}' created with ${createdTasks.length} departmental tasks.`,
      project,
      tasks: createdTasks,
    });
  } catch (err: any) {
    console.error("POST /api/agent/plan-project error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to plan project" }, { status: 500 });
  }
}
