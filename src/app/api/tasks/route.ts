import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseQuickInput } from "@/lib/nlp";
import { createTask } from "@/lib/tasks";
import { sendPushToEmployee } from "@/lib/push";
import { effectiveCapsForSession, scopedTaskWhere } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks — NLP quick-capture.
 * Body: { raw } OR explicit fields. Accepts the Cmd+K / quick-add syntax:
 *   "Ship NovaFit landing @maya #dev !P1 ~fri"
 */
const schema = z.object({
  raw: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  assignee: z.string().nullish(),
  assigneeId: z.string().nullish(),
  assigneeIds: z.array(z.string()).nullish(),
  department: z.string().nullish(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).nullish(),
  due: z.string().nullish(),
  dueDate: z.string().nullish(),
  gain: z.string().nullish(),
  outcome: z.string().nullish(),
  category: z.enum(["CALL", "MEETING", "SCREENING", "BUG_FIX", "DEVELOPMENT", "DESIGN", "CRM", "ADMIN", "DOCUMENTATION", "OTHER"]).nullish(),
  clientId: z.string().nullish(),
  projectId: z.string().nullish(),
});

export async function GET(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined;
    const priority = searchParams.get("priority") || undefined;
    const query = searchParams.get("q") || undefined;
    const limitParam = searchParams.get("limit");
    const take = limitParam ? parseInt(limitParam, 10) : 500;

    const scopeWhere = await scopedTaskWhere(session as any);
    const where: any = { deletedAt: null, ...scopeWhere };
    if (projectId) where.projectId = projectId;
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (query) {
      // Combine with any OR already set by scopedTaskWhere via AND, so a
      // department-scoped viewer's search doesn't fall back to org-wide.
      const searchOr = [
        { title: { contains: query, mode: "insensitive" } },
        { code: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
      if (where.OR) {
        where.AND = [...(where.AND ?? []), { OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        assignees: { include: { employee: { select: { id: true, name: true, role: true } } } },
        subtasks: { orderBy: { order: "asc" } },
        
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take,
    });

    return NextResponse.json({ ok: true, tasks });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/** COO 2026-10-06 deadline system: every created task gets a due date.
 * Project endDate wins; otherwise 3 business days (Mon-Fri, UTC days) from now. */
async function defaultDueDate(dueDate: string | null, projectId: string | null): Promise<string | null> {
  if (dueDate) return dueDate;
  if (projectId) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { endDate: true },
    });
    if (proj?.endDate) return proj.endDate.toISOString();
  }
  const d = new Date();
  let added = 0;
  while (added < 3) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString();
}

export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const body = schema.parse(await req.json());

    // If `raw` came in, run the pure NLP parser to fill the rest.
    let input: z.infer<typeof schema>;
    if (body.raw) {
      const parsed = parseQuickInput(body.raw);
      input = {
        raw: body.raw,
        title: body.title ?? parsed.title,
        assignee: parsed.assignee,
        department: parsed.department,
        priority: parsed.priority,
        due: parsed.due,
        gain: "L2-Retention",
        outcome: "Capture task completed and verified",
      };
    } else {
      input = body;
    }

    const caps = await effectiveCapsForSession(session);
    const canAssign = caps.has("tasks.assign");

    const task = await createTask({
      title: input.title ?? "Untitled task",
      description: input.description ?? null,
      assignee: input.assignee ?? null,
      assigneeId: input.assigneeId ?? null,
      assigneeIds: input.assigneeIds ?? undefined,
      department: input.department ?? null,
      priority: input.priority ?? "P2",
      category: input.category ?? "OTHER",
      due: input.due ?? null,
      dueDate: await defaultDueDate(input.dueDate ?? null, input.projectId ?? null),
      gain: input.gain ?? null,
      outcome: input.outcome ?? null,
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      creatorId: session.user.id,
      canAssign,
    });

    // Desktop push to all assignees (PWA/Web Push) — fires even when the tab is closed.
    for (const aid of task.assignees) {
      if (aid.id !== session.user.id) {
        await sendPushToEmployee(aid.id, {
          title: "New task assigned",
          body: `${task.code} — ${task.title}`,
          url: "/tasks",
        });
      }
    }

    return NextResponse.json({ ok: true, task });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}