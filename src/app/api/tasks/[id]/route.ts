import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { changeTaskStatus, editTask, pauseTask, startWork, taskView, removeAssignee, archiveTask } from "@/lib/tasks";
import { alertEmployee } from "@/lib/alerting";
import { effectiveCapsForSession, scopedTaskWhere } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id] | ?code=TSK-101   → single task view (for the global drawer)
 * PATCH /api/tasks/[id]                 → status / subtask / assignee actions
 */
const statusSchema = z
  .object({
    action: z.literal("status"),
    status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"]),
    reason: z.string().nullish(),
    outcome: z.string().nullish(), // captured at completion time
  })
  .superRefine((val, ctx) => {
    // COO req — moving a task to BLOCKED requires a non-blank blocker description.
    if (val.status === "BLOCKED" && !val.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A blocker description is required to move a task to Blocked.",
      });
    }
  });
const subSchema = z.object({
  action: z.literal("subtask"),
  subtaskId: z.string(),
  done: z.boolean(),
});
const addSubSchema = z.object({
  action: z.literal("add_subtask"),
  title: z.string().min(1),
  description: z.string().nullish(),
});
const editSubSchema = z.object({
  action: z.literal("edit_subtask"),
  subtaskId: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().nullish().optional(),
});
const addAssigneeSchema = z.object({
  action: z.literal("add_assignee"),
  employeeId: z.string(),
});
// Edit task — field-level, permission-gated (assigner / assignee / leadership).
// Semantics: `undefined` = field unchanged, `null` = clear the field, value = set.
const editSchema = z.object({
  action: z.literal("edit"),
  title: z.string().min(1).optional(),
  description: z.string().nullish().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  category: z.enum(["CALL", "MEETING", "SCREENING", "BUG_FIX", "DEVELOPMENT", "DESIGN", "CRM", "ADMIN", "DOCUMENTATION", "OTHER"]).optional(),
  dueDate: z.string().nullish().optional(),
  estimateHrs: z.number().nullish().optional(),
  gainLever: z.string().nullish().optional(),
  outcome: z.string().nullish().optional(),
});
const startSchema = z.object({ action: z.literal("start") });
const pauseSchema = z.object({ action: z.literal("pause"), reason: z.string().nullish() });
const removeAssigneeSchema = z.object({
  action: z.literal("remove_assignee"),
  employeeId: z.string(),
});
const archiveSchema = z.object({
  action: z.literal("archive"),
  archived: z.boolean(),
});

const WITH = {
  assignee: { select: { id: true, name: true } },
  department: { select: { id: true, name: true, color: true } },
  client: { select: { id: true, name: true } },
  subtasks: { orderBy: { order: "asc" } },
  assignees: { include: { employee: { select: { id: true, name: true } } } },
  creator: { select: { id: true, name: true } },
  workSessions: true,
} as const;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.view");
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const withActivity = url.searchParams.get("activity") === "1";
    const query = code || params.id;
    // Sibling routes (comments, reports) on this exact resource already
    // scope by department — this one didn't, so anyone who could
    // learn/guess a task id or code could pull full cross-department detail.
    const scopeWhere = await scopedTaskWhere(session as any);
    const task = await prisma.task.findFirst({
      where: {
        deletedAt: null,
        AND: [{ OR: [{ id: query }, { code: query }] }, scopeWhere],
      },
      include: WITH,
    });
    if (!task) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });

    let recent: { type: string; actor: string | null; at: string; payload: unknown }[] = [];
    if (withActivity) {
      const acts = await prisma.activity.findMany({
        where: { entityType: "task", entityId: task.id },
        include: { actor: { select: { name: true } } },
        orderBy: { occurredAt: "desc" },
        take: 12,
      });
      recent = acts.map((a) => ({
        type: a.type,
        actor: a.actor?.name ?? null,
        at: a.occurredAt.toISOString(),
        payload: a.payload,
      }));
    }

    return NextResponse.json({ ok: true, task: taskView(task), recent });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.manage");
    const body = await req.json();

    let targetTask = await prisma.task.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: params.id }, { code: params.id }],
      },
      select: { id: true, code: true, title: true, outcome: true, assigneeId: true, creatorId: true },
    });

    // Fallback: If pausing or if params.id === "current", look up actor's active running task
    if (!targetTask && (params.id === "current" || body?.action === "pause")) {
      const openSession = await (prisma as any).taskWorkSession.findFirst({
        where: { assigneeId: session.user.id, endedAt: null },
        include: { task: { select: { id: true, code: true, title: true, outcome: true, assigneeId: true, creatorId: true } } },
      });
      if (openSession?.task) {
        targetTask = openSession.task;
      }
    }

    if (!targetTask) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    const taskId = targetTask.id;

    if (body?.action === "status") {
      const { status, reason } = statusSchema.parse(body);

      // APPROVAL GATE: If non-creator/non-leadership tries to mark DONE, route to IN_REVIEW instead
      const caps = await effectiveCapsForSession(session);
      const isCreatorOrLeadership = session.user.id === targetTask.creatorId || caps.has("tasks.assign");

      let effectiveStatus = status;
      if (status === "DONE" && !isCreatorOrLeadership) {
        effectiveStatus = "IN_REVIEW";
      }

      // Save outcome text when completing or submitting for review
      if ((effectiveStatus === "DONE" || effectiveStatus === "IN_REVIEW") && body?.outcome?.trim()) {
        await prisma.task.update({
          where: { id: taskId },
          data: { outcome: body.outcome.trim() },
        });
      }

      // Execute status change FIRST - if this fails/throws, no success notification is emitted
      await changeTaskStatus(taskId, effectiveStatus, session.user.id, reason ?? null);

      // If moved to IN_REVIEW, notify the creator
      if (effectiveStatus === "IN_REVIEW" && targetTask.creatorId && targetTask.creatorId !== session.user.id) {
        await alertEmployee({
          employeeId: targetTask.creatorId,
          title: "🔍 Review requested: " + targetTask.code,
          detail: (session.user.name || "Assignee") + " submitted " + targetTask.title + " for your approval.",
          kind: "alert",
          severity: "Medium",
          url: "/tasks?task=" + encodeURIComponent(targetTask.code),
          capture: {
            type: "REVIEW_REQUESTED",
            entityType: "task",
            entityId: taskId,
            payload: { submitterId: session.user.id, outcome: body?.outcome?.trim() ?? targetTask.outcome ?? null },
          },
        }).catch(() => {});
      }

      // Emit success notification only AFTER status change successfully commits
      if (status === "DONE") {
        const fullTask = await prisma.task.findUnique({
          where: { id: taskId },
          include: { 
            assignees: {
               include: { employee: true }
            }
          }
        });
        const assigneesIds = (fullTask?.assignees || []).map(a => a.employeeId);
        if(!assigneesIds.includes(session.user.id)) assigneesIds.push(session.user.id);
        
        for (const uid of assigneesIds) {
          await alertEmployee({
            employeeId: uid,
          title: `✅ Completed ${targetTask.code}`,
          detail: `“${targetTask.title}” is done. It ships into your week record + leadership/HR insights.`,
          kind: "alert",
          severity: "High",
          url: `/tasks?task=${encodeURIComponent(targetTask.code)}`,
          capture: {
            type: "OUTCOME_RECORDED",
            entityType: "task",
            entityId: taskId,
            payload: { action: "close", outcome: body?.outcome?.trim() ?? targetTask.outcome ?? null },
          },
        }).catch(() => {});
      }

      }

      return NextResponse.json({ ok: true });
    }

    if (body?.action === "subtask") {
      const { subtaskId, done } = subSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      const isCreatorOrLeadership = session.user.id === targetTask.creatorId || caps.has("tasks.assign");

      let finalDone = done;
      let finalStatus = done ? "DONE" : "TODO";

      // If completing and not creator/leadership, route to review
      if (done && !isCreatorOrLeadership) {
        finalDone = false;
        finalStatus = "IN_REVIEW";
      } else if (!done) {
        finalStatus = "TODO";
      }

      const updated = await prisma.subtask.update({ 
        where: { id: subtaskId }, 
        data: { done: finalDone, status: finalStatus } 
      });

      await prisma.activity.create({
        data: {
          type: "SUBTASK_TOGGLED",
          actorId: session.user.id,
          entityType: "task",
          entityId: taskId,
          payload: { v: 1, subtaskId, done: finalDone, status: finalStatus },
        },
      });

      // Send notifications
      if (finalStatus === "IN_REVIEW" && targetTask.creatorId && targetTask.creatorId !== session.user.id) {
        await alertEmployee({
          employeeId: targetTask.creatorId,
          title: "🔍 Subtask Review",
          detail: `${session.user.name || "Assignee"} submitted a subtask for review in ${targetTask.code}.`,
          kind: "alert",
          severity: "Medium",
          url: "/tasks?task=" + encodeURIComponent(targetTask.code),
        }).catch(() => {});
      } else if (finalDone && session.user.id !== targetTask.assigneeId && targetTask.assigneeId) {
        await alertEmployee({
          employeeId: targetTask.assigneeId,
          title: "✅ Subtask completed",
          detail: `${session.user.name || "A team member"} marked a subtask as done in ${targetTask.code}.`,
          kind: "alert",
          severity: "Low",
          url: `/tasks?task=${encodeURIComponent(targetTask.code)}`,
        }).catch(() => {});
      }

      return NextResponse.json({ ok: true, done: updated.done, status: updated.status });
    }

    if (body?.action === "add_subtask") {
      const { title, description } = addSubSchema.parse(body);
      const maxOrder = await prisma.subtask.aggregate({
        where: { taskId: taskId },
        _max: { order: true },
      });
      const nextOrder = (maxOrder._max.order ?? -1) + 1;
      const subtask = await prisma.subtask.create({
        data: { taskId: taskId, title: title.trim(), description: description ?? null, order: nextOrder },
      });

      if (targetTask.assigneeId && targetTask.assigneeId !== session.user.id) {
        await alertEmployee({
          employeeId: targetTask.assigneeId,
          title: `📝 New subtask in ${targetTask.code}`,
          detail: `${session.user.name || "A team member"} added a subtask: "${title.trim()}"`,
          kind: "alert",
          severity: "Low",
          url: `/tasks?task=${encodeURIComponent(targetTask.code)}`,
        }).catch(() => {});
      }

      return NextResponse.json({ ok: true, subtask });
    }

    if (body?.action === "edit_subtask") {
      const { subtaskId, title, description } = editSubSchema.parse(body);
      const subtask = await prisma.subtask.update({
        where: { id: subtaskId },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description: description ?? null } : {}),
        },
      });
      return NextResponse.json({ ok: true, subtask });
    }

    if (body?.action === "add_assignee") {
      const { employeeId } = addAssigneeSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      if (!caps.has("tasks.assign") && employeeId !== session.user.id) {
        return NextResponse.json(
          { ok: false, error: "Only leadership can add assignees. You can assign to yourself, or ask your lead." },
          { status: 403 }
        );
      }
      await prisma.taskAssignee.upsert({
        where: { taskId_employeeId: { taskId: taskId, employeeId } },
        create: { taskId: taskId, employeeId },
        update: {},
      });
      if (!targetTask.assigneeId) {
        await prisma.task.update({ where: { id: taskId }, data: { assigneeId: employeeId } });
      }


      return NextResponse.json({ ok: true });
    }

    if (body?.action === "edit") {
      const patch = editSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      await editTask(taskId, session.user.id, caps, {
        title: patch.title,
        description: patch.description, // null → clear
        priority: patch.priority,
        category: patch.category,
        dueDate: patch.dueDate, // "" or null → clear
        estimateHrs: patch.estimateHrs,
        gainLever: patch.gainLever,
        outcome: patch.outcome,
      });


      return NextResponse.json({ ok: true });
    }

    if (body?.action === "start") {
      startSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      await startWork(taskId, session.user.id, caps);
      await alertEmployee({
        employeeId: session.user.id,
        title: `▶ Started ${targetTask.code}`,
        detail: `Clock is running on “${targetTask.title}”. Stay locked in!`,
        kind: "alert",
        severity: "Low",
        url: `/tasks?task=${encodeURIComponent(targetTask.code)}`,
        capture: {
          type: "TASK_STARTED",
          entityType: "task",
          entityId: taskId,
          payload: { action: "start" },
        },
      });


      return NextResponse.json({ ok: true });
    }

    if (body?.action === "pause") {
      const { reason } = pauseSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      await pauseTask(taskId, session.user.id, caps, reason ?? null);
      await alertEmployee({
        employeeId: session.user.id,
        title: `⏸ Paused ${targetTask.code}`,
        detail: `Clock paused on “${targetTask.title}”. Work time logged.`,
        kind: "alert",
        severity: "Low",
        url: `/tasks?task=${encodeURIComponent(targetTask.code)}`,
        capture: {
          type: "TASK_PAUSED",
          entityType: "task",
          entityId: taskId,
          payload: { action: "pause", reason: reason ?? null },
        },
      });


      return NextResponse.json({ ok: true });
    }

    if (body?.action === "remove_assignee") {
      const { employeeId } = removeAssigneeSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      await removeAssignee(taskId, employeeId, session.user.id, caps);


      return NextResponse.json({ ok: true });
    }

    if (body?.action === "archive") {
      const { archived } = archiveSchema.parse(body);
      const caps = await effectiveCapsForSession(session);
      await archiveTask(taskId, session.user.id, caps, archived);


      return NextResponse.json({ ok: true });
    }

    if (body?.action === "delete") {
      if (session.user.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { ok: false, error: "Forbidden: Task deletion is restricted to super admins." },
          { status: 403 }
        );
      }

      await prisma.task.update({
        where: { id: taskId },
        data: { deletedAt: new Date() },
      });

      await (prisma as any).taskWorkSession.updateMany({
        where: { taskId, endedAt: null },
        data: { endedAt: new Date(), note: "Task deleted by super admin" },
      });

      await prisma.activity.create({
        data: {
          type: "TASK_UPDATED",
          actorId: session.user.id,
          entityType: "task",
          entityId: taskId,
          payload: { code: targetTask.code, title: targetTask.title, deletedBy: session.user.email ?? session.user.id },
        },
      });

      return NextResponse.json({ ok: true, deleted: true, code: targetTask.code });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.manage");
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Forbidden: Task deletion is restricted to super admins." },
        { status: 403 }
      );
    }

    const targetTask = await prisma.task.findFirst({
      where: {
        OR: [{ id: params.id }, { code: params.id }],
      },
      select: { id: true, code: true, title: true },
    });

    if (!targetTask) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    const taskId = targetTask.id;

    await prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    await (prisma as any).taskWorkSession.updateMany({
      where: { taskId, endedAt: null },
      data: { endedAt: new Date(), note: "Task deleted by super admin" },
    });

    await prisma.activity.create({
      data: {
        type: "TASK_UPDATED",
        actorId: session.user.id,
        entityType: "task",
        entityId: taskId,
        payload: { code: targetTask.code, title: targetTask.title, deletedBy: session.user.email ?? session.user.id },
      },
    });

    return NextResponse.json({ ok: true, deleted: true, code: targetTask.code });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}