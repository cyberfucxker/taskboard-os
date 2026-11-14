import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { effectiveCapsForSession } from "@/lib/scope";
import { SEEDED_PIPELINES, type PipelineTaskTemplate } from "../route";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  pipelineId: z.string(),
  // Either existing projectId OR create new project with client
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  clientId: z.string().optional(),
  ownerId: z.string().optional(),
  prefix: z.string().optional(), // optional task prefix
  assigneeMap: z.record(z.string()).optional(), // custom assignee per task index
  taskOverrides: z.array(
    z.object({
      title: z.string(),
      category: z.enum(["DEVELOPMENT", "DESIGN", "CALL", "MEETING", "BUG_FIX", "CRM", "ADMIN", "DOCUMENTATION", "OTHER"]).default("OTHER"),
      priority: z.enum(["P0", "P1", "P2", "P3"]).default("P1"),
      estimateHrs: z.number().optional(),
      gainLever: z.string().optional(),
      subtasks: z.array(z.object({ title: z.string(), description: z.string().optional() })),
    })
  ).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const body = await req.json();
    const input = applySchema.parse(body);

  // 1. Find the pipeline definition
  let pipelineTasks: any[] = input.taskOverrides ?? [];
  let pipelineName = "Custom Pipeline";
  let pipelineDeptSlug: string | null = null;

  if (!input.taskOverrides || input.taskOverrides.length === 0) {
    const seeded = SEEDED_PIPELINES.find((p) => p.id === input.pipelineId);
    if (seeded) {
      pipelineTasks = seeded.tasks;
      pipelineName = seeded.name;
      pipelineDeptSlug = seeded.departmentSlug;
    } else {
      const custom = await prisma.service.findUnique({
        where: { id: input.pipelineId },
        include: { department: { select: { slug: true } } },
      });
      if (custom && Array.isArray(custom.taskTemplate)) {
        pipelineTasks = custom.taskTemplate as unknown as PipelineTaskTemplate[];
        pipelineName = custom.name;
        pipelineDeptSlug = custom.department?.slug ?? null;
      }
    }
  }

  if (pipelineTasks.length === 0) {
    return NextResponse.json({ ok: false, error: "No tasks found in selected pipeline" }, { status: 400 });
  }

  // Same boundary as GET /api/pipelines: a viewer only ever sees their own
  // department's pipelines in the picker, but nothing stopped a raw request
  // with another department's pipelineId from actually applying it — e.g. an
  // HR employee or intern spawning a full dev sprint's worth of tasks on a
  // real client project. `taskOverrides` (a fully custom, ad-hoc pipeline the
  // caller wrote themselves) has no department to check.
  if (pipelineDeptSlug && (!input.taskOverrides || input.taskOverrides.length === 0)) {
    const caps = await effectiveCapsForSession(session as any);
    const seesAllDepartments = caps.has("board.view") || caps.has("admin.scope");
    const viewerDeptSlug = (session as any)?.user?.departmentSlug ?? null;
    if (!seesAllDepartments && pipelineDeptSlug !== viewerDeptSlug) {
      return NextResponse.json(
        { ok: false, error: "This pipeline belongs to a different department" },
        { status: 403 }
      );
    }
  }

  // 2. Resolve or Create Project
  let targetProjectId = input.projectId;
  let clientName = "Client Project";

  if (!targetProjectId) {
    if (!input.projectName) {
      return NextResponse.json({ ok: false, error: "Project name is required to create a new project" }, { status: 400 });
    }

    let effectiveClientId = input.clientId;
    if (!effectiveClientId) {
      // "No Client (Internal)" must never silently attach to an arbitrary
      // real client — find-or-create one dedicated internal placeholder.
      let internalClient = await prisma.client.findFirst({
        where: { name: "Internal (No Client)", deletedAt: null },
        select: { id: true },
      });
      if (!internalClient) {
        const org = await prisma.org.findFirst({ select: { id: true } });
        if (!org) {
          return NextResponse.json({ ok: false, error: "No organization found — cannot create internal client" }, { status: 500 });
        }
        internalClient = await prisma.client.create({
          data: { orgId: org.id, name: "Internal (No Client)", status: "Active" },
          select: { id: true },
        });
      }
      effectiveClientId = internalClient.id;
    }

    const newProj = await prisma.project.create({
      data: {
        name: input.projectName,
        clientId: effectiveClientId,
        ownerId: input.ownerId ?? session.user.id,
        category: pipelineName,
        status: "ACTIVE",
        description: `Project launched from pipeline: ${pipelineName}`,
      },
      include: { client: { select: { name: true } } },
    });
    targetProjectId = newProj.id;
    clientName = newProj.client?.name ?? input.projectName;
  } else {
    const existing = await prisma.project.findUnique({
      where: { id: targetProjectId },
      include: { client: { select: { name: true } } },
    });
    if (existing) {
      clientName = existing.client?.name ?? existing.name;
    }
  }

  // 3. Resolve Assignees across employees
  const allEmployees = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, role: true, title: true, email: true },
  });

  const createdTasks: any[] = [];

  for (let i = 0; i < pipelineTasks.length; i++) {
    const t = pipelineTasks[i];
    
    // Determine assignee
    let assigneeId: string | null = null;
    if (input.assigneeMap && input.assigneeMap[String(i)]) {
      assigneeId = input.assigneeMap[String(i)];
    } else if (t.defaultRoleOrTitle) {
      const match = allEmployees.find(
        (e) =>
          e.title?.toLowerCase().includes(t.defaultRoleOrTitle!.toLowerCase()) ||
          e.role.toLowerCase().includes(t.defaultRoleOrTitle!.toLowerCase())
      );
      assigneeId = match?.id ?? session.user.id;
    } else {
      assigneeId = session.user.id;
    }

    // Generate unique task code
    const count = await prisma.task.count();
    const taskCode = `TSK-${count + 101 + i}`;

    const created = await prisma.task.create({
      data: {
        code: taskCode,
        title: input.prefix ? `${input.prefix} ${t.title}` : t.title,
        projectId: targetProjectId,
        clientId: input.clientId ?? null,
        creatorId: session.user.id,
        assigneeId: assigneeId,
        priority: t.priority,
        category: t.category,
        estimateHrs: t.estimateHrs ?? null,
        gainLever: t.gainLever ?? null,
        status: "TODO",
        assignees: assigneeId
          ? {
              create: {
                employeeId: assigneeId,
              },
            }
          : undefined,
        subtasks: {
          create: (t.subtasks || []).map((st: any, idx: number) => ({
            title: st.title,
            description: st.description ?? null,
            done: false,
            order: idx,
          })),
        },
      },
      include: {
        subtasks: true,
        assignees: { include: { employee: { select: { id: true, name: true } } } },
      },
    });

    createdTasks.push(created);
  }

  return NextResponse.json({
    ok: true,
    projectId: targetProjectId,
    pipelineName,
    tasksCreatedCount: createdTasks.length,
    tasks: createdTasks,
  });
} catch (err) {
  const status = (err as { status?: number }).status ?? 500;
  return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
}
}
