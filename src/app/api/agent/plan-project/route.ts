import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { nextTaskCode } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const planProjectSchema = z.object({
  projectId: z.string().min(1),
  departmentTasks: z.array(
    z.object({
      departmentName: z.string().min(1),
      title: z.string().min(3),
      priority: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
      category: z.string().default("DEVELOPMENT"),
      subtasks: z.array(
        z.object({
          title: z.string().min(2),
          description: z.string().nullish(),
          assigneeId: z.string().nullish(),
          estimateHrs: z.number().nullish(),
        })
      ),
    })
  ),
});

/**
 * POST /api/agent/plan-project
 * Autonomous Project Deconstruction:
 * Takes an AI-generated architectural breakdown and automatically creates
 * Departmental Tasks and Subtask Milestones under a Project.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const body = planProjectSchema.parse(await req.json());

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      include: { client: true },
    });
    if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

    const departments = await prisma.department.findMany();
    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase().trim(), d.id]));

    const createdTasks = [];

    for (const dt of body.departmentTasks) {
      const matchedDeptId = deptMap.get(dt.departmentName.toLowerCase().trim()) ?? null;
      const code = await nextTaskCode();

      const task = await prisma.task.create({
        data: {
          code,
          title: dt.title,
          priority: dt.priority,
          category: (dt.category as any) || "DEVELOPMENT",
          projectId: project.id,
          clientId: project.clientId,
          departmentId: matchedDeptId,
          creatorId: session.user.id,
          subtasks: {
            create: dt.subtasks.map((st, idx) => ({
              title: st.title,
              description: st.description ?? null,
              assigneeId: st.assigneeId ?? null,
              estimateHrs: st.estimateHrs ? (st.estimateHrs as any) : null,
              order: idx,
              status: "TODO",
            })),
          },
        },
        include: {
          subtasks: true,
          department: true,
        },
      });

      createdTasks.push(task);
    }

    return NextResponse.json({
      ok: true,
      message: `Successfully created ${createdTasks.length} department tasks with milestones`,
      tasks: createdTasks,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}