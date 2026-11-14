import { prisma } from "@/lib/db";
import { generateTaskCode, taskLookupClauses } from "@/lib/taskCode";
import type { Prisma, Task, Subtask, Employee, Department } from "@prisma/client";
import { emitEvent } from "@/lib/eventlog";
import { dueOffsetDays } from "@/lib/nlp";
import { resolveEmployee, resolveDepartment, resolveClient } from "@/lib/resolve";
import { notifyAssignee, notifyAllLeadership } from "@/lib/agent-notify";

type TaskWith = Task & {
  assignee?: Pick<Employee, "id" | "name"> | null;
  creator?: Pick<Employee, "id" | "name"> | null;
  department?: Pick<Department, "id" | "name" | "color"> | null;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  subtasks?: (Subtask & { description?: string | null })[];
  assignees?: { employee: Pick<Employee, "id" | "name"> }[];
  workSessions?: { assigneeId: string; elapsedSec: number | null }[];
};

/** View model shared by the Tasks page + every API that returns a task. */
export function taskView(t: TaskWith) {
  // Aggregate elapsed time per assignee from work sessions
  const workMap = new Map<string, { name: string | null; elapsedMs: number }>();
  for (const ws of t.workSessions ?? []) {
    const existing = workMap.get(ws.assigneeId) ?? { name: null, elapsedMs: 0 };
    existing.elapsedMs += (ws.elapsedSec ?? 0) * 1000;
    workMap.set(ws.assigneeId, existing);
  }
  // Fill in names from assignee list
  for (const a of t.assignees ?? []) {
    const w = workMap.get(a.employee.id);
    if (w) w.name = a.employee.name;
  }

  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description ?? null,
    descriptionBy: t.descriptionBy ?? null,
    descriptionByName: resolveDescAuthor(t),
    creatorId: t.creatorId ?? null,
    creatorName: t.creator?.name ?? null,
    status: t.status,
    category: t.category ?? "OTHER",
    priority: t.priority,
    blocked: t.blocked,
    blockerReason: t.blockerReason,
    gainLever: t.gainLever,
    outcome: t.outcome,
    dueDate: t.dueDate?.toISOString() ?? null,
    dueLabel: t.dueLabel,
    assigneeId: t.assigneeId,
    assignee: t.assignee?.name ?? null,
    clientId: t.clientId ?? null,
    clientName: t.client?.name ?? null,
    projectId: t.projectId ?? null,
    projectName: t.project?.name ?? null,
    // Full assignee list (join table). Falls back to primary assignee if no join rows.
    assignees: (t.assignees ?? []).length > 0
      ? (t.assignees ?? []).map((a) => ({ id: a.employee.id, name: a.employee.name, }))
      : t.assignee ? [{ id: t.assignee.id, name: t.assignee.name }] : [],
    department: t.department?.name ?? (t.assignees?.[0] as any)?.employee?.department?.name ?? null,
    departmentColor: t.department?.color ?? (t.assignees?.[0] as any)?.employee?.department?.color ?? null,
    subtasks: (t.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, description: s.description ?? null, done: s.done, status: s.status })),
    estimateHrs: t.estimateHrs ?? null,
    actualHrs: t.actualHrs ?? null,
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    elapsedMs:
      t.startedAt && t.completedAt
        ? t.completedAt.getTime() - t.startedAt.getTime()
        : t.startedAt
        ? Date.now() - t.startedAt.getTime()
        : null,
    work: Array.from(workMap.entries()).map(([assigneeId, w]) => ({
      assigneeId,
      name: w.name,
      elapsedMs: w.elapsedMs,
    })),
  };
}

export type TaskView = ReturnType<typeof taskView>;

/** New random 3-char task code, checked unique against code and legacyCode. */
export async function nextTaskCode(): Promise<string> {
  return generateTaskCode(async (c) => {
    const hit = await prisma.task.findFirst({
      where: { OR: [{ code: c }, { legacyCode: c }] },
      select: { id: true },
    });
    return !!hit;
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assignee?: string | null; // name/email token (NLP)
  assigneeId?: string | null; // primary assignee id (form)
  assigneeIds?: string[]; // all assignee ids (multi-assignee form)
  department?: string | null; // token
  priority?: "P0" | "P1" | "P2" | "P3";
  category?: "CALL" | "MEETING" | "SCREENING" | "BUG_FIX" | "DEVELOPMENT" | "DESIGN" | "CRM" | "ADMIN" | "DOCUMENTATION" | "OTHER";
  due?: string | null; // token ("today", "fri", "next")
  dueDate?: string | null; // exact yyyy-mm-dd (form)
  gain?: string | null;
  outcome?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  creatorId?: string | null;
  /** leadership capability — required to assign to anyone other than yourself */
  canAssign?: boolean;
}

/** Parse a due-date string defensively. Accepts yyyy-mm-dd (forms) and full ISO
 * datetimes (server defaults); rejects garbage ("Invalid Date", malformed) as null
 * instead of producing an Invalid Date that crashes Prisma. */
export function parseDueDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "Invalid Date") return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createTask(input: CreateTaskInput): Promise<TaskView> {
  // Resolve primary assignee (backward compat single FK)
  const rawAssigneeId = input.assigneeId ?? (input.assignee ? await resolveEmployee(input.assignee) : null);
  if (input.assignee && !rawAssigneeId) {
    throw new Error("Could not resolve assignee: @" + input.assignee);
  }
  const assigneeId = rawAssigneeId;
  // Department attribution (COO 2026-10-07): an explicit choice wins; otherwise the
  // primary assignee department (the people doing the work), else the creator own.
  // So design work ordered by Sales but assigned to Design lands in Design.
  let deptId = input.department ? await resolveDepartment(input.department) : null;
  if (!deptId && assigneeId) {
    deptId = (await prisma.employee.findUnique({ where: { id: assigneeId }, select: { departmentId: true } }))?.departmentId ?? null;
  }
  if (!deptId && input.creatorId) {
    deptId = (await prisma.employee.findUnique({ where: { id: input.creatorId }, select: { departmentId: true } }))?.departmentId ?? null;
  }

  // Build the full assignee list: merge primary + explicit list, dedupe
  const allAssigneeIds = [...new Set([
    ...(input.assigneeIds ?? []),
    ...(assigneeId ? [assigneeId] : []),
  ])];

  // Assignment rule (CORE-TASK): leadership (tasks.assign) can assign to anyone;
  // everyone else may only assign to themselves. No one can be forced to take a task.
  for (const aid of allAssigneeIds) {
    if (aid !== input.creatorId && !input.canAssign) {
      const err = new Error(
        "Assigning tasks to other people is restricted to leadership. " +
        "You can assign a task to yourself, or ask your lead. (Grant \"Assign tasks\" on the Access page to enable someone.)"
      );
      (err as unknown as { status: number }).status = 403;
      throw err;
    }
  }
  // Project → client: if a project is chosen, pull the owning client so a task
  // never ends up on a project whose client it doesn't belong to.
  const projectId = input.projectId && input.projectId.trim() ? input.projectId : null;
  const projectClientId = projectId
    ? (await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } }))?.clientId
    : null;
  const clientId = input.clientId || projectClientId || null;
  const offsetDays = input.due ? dueOffsetDays(input.due) : null;
  const dueFromOffset = offsetDays != null ? new Date(Date.now() + offsetDays * 86400000) : null;
  const dueDate = parseDueDate(input.dueDate) ?? dueFromOffset;
  const dueLabel = dueDate
    ? dueDate.toDateString() === new Date().toDateString()
      ? "Today"
      : dueDate.toDateString() === new Date(Date.now() + 86400000).toDateString()
      ? "Tomorrow"
      : dueDate.toLocaleDateString("en-US", { weekday: "short" })
    : null;

  // ACCOUNTABILITY: title must be descriptive, not vague
  const rawTitle = (input.title ?? "").trim();
  if (rawTitle.length < 5) {
    throw new Error("Task title is too vague. Use at least 5 characters describing what this task is about.");
  }
  // ACCOUNTABILITY: detect duplicate vague tasks (same title, not DONE)
  if (rawTitle.length < 15) {
    const dupes = await prisma.task.findMany({
      where: { title: { equals: rawTitle, mode: "insensitive" }, status: { notIn: ["DONE"] }, deletedAt: null },
      select: { code: true, title: true, status: true },
    });
    if (dupes.length > 0) {
      const codes = dupes.map((d) => d.code).join(", ");
      throw new Error(`Duplicate task "${rawTitle}" already exists (${codes}). Update the existing task instead of creating a new one.`);
    }
  }

  const code = await nextTaskCode();
  const task = await prisma.task.create({
    data: {
      code,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      descriptionBy: input.description?.trim() ? input.creatorId ?? null : null,
      priority: input.priority ?? "P2",
      category: input.category ?? "OTHER",
      assigneeId: allAssigneeIds[0] ?? null, // primary = first
      creatorId: input.creatorId ?? null,
      departmentId: deptId,
      clientId,
      projectId,
      gainLever: input.gain ?? null,
      outcome: input.outcome ?? null,
      dueDate,
      dueLabel,
      // Create join-table rows for all assignees
      assignees: allAssigneeIds.length > 0
        ? { create: allAssigneeIds.map((eid) => ({ employeeId: eid })) }
        : undefined,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, color: true } },
      subtasks: true,
      assignees: { include: { employee: { select: { id: true, name: true } } } },
    },
  });

  await emitEvent({
    type: "TASK_CREATED",
    actorId: input.creatorId ?? undefined,
    entityType: "task",
    entityId: task.id,
    clientId: clientId ?? undefined,
    payload: { code, title: task.title, priority: task.priority },
    topic: "task.created",
  });

  if (task.assigneeId) {
    await notifyAssignee(task.assigneeId, "TASK_ASSIGNED", {
      title: "New task assigned",
      body: `${task.code}: ${task.title}`,
      taskCode: task.code,
      taskId: task.id,
      action: "assigned",
    });
  }

  return taskView(task);
}

function isDueToday(d: Date | null | undefined): boolean {
  if (!d) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return due === today;
}

/** State machine (DM-06): allowed successor statuses for a task. */
export const TASK_FLOW: Record<string, string[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "DONE"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED", "TODO", "DONE"],
  IN_REVIEW: ["DONE", "IN_PROGRESS", "BLOCKED", "TODO"],
  BLOCKED: ["IN_PROGRESS", "DONE", "TODO"],
  DONE: ["IN_PROGRESS", "TODO", "BLOCKED"],
};

/** Idempotent status change with event emission + completedAt stamping. */
export async function changeTaskStatus(
  taskId: string,
  next: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE",
  actorId?: string | null,
  reason?: string | null
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  // Validate status transition
  const allowed = TASK_FLOW[task.status] ?? [];
  if (task.status !== next && !allowed.includes(next)) {
    throw new Error(`Invalid status transition from ${task.status} to ${next}`);
  }

  const update: Prisma.TaskUpdateInput = { status: next as any };

  // ACCOUNTABILITY: IN_PROGRESS requires a description (prevents vague tasks from being worked)
  if (next === "IN_PROGRESS" && !task.description?.trim()) {
    throw new Error("Cannot start a task without a description. Add what this task involves first.");
  }
  if (next === "IN_PROGRESS") update.startedAt = task.startedAt ?? new Date(); // stamp on first start only
  // COO 2026-10-06 deadline system: parallel IN_PROGRESS is allowed — the old
  // single-track auto-pause (ending siblings + resetting them to TODO) is gone.
  if (next === "DONE") update.completedAt = new Date();
  if (next !== "DONE") update.completedAt = null;

  // ACCOUNTABILITY: DONE requires outcome (prevents vague task closure)
  if (next === "DONE" && !task.outcome?.trim()) {
    throw new Error("Cannot complete task without an outcome. Set the outcome field first (what was achieved).");
  }
  // HIGH-06: marking DONE must close every open TaskWorkSession so time-tracking
  // isn't left dangling (endedAt=null) and a later pause doesn't credit the whole
  // idle/DONE window as billable time.
  if (next === "DONE" || next === "IN_REVIEW") {
    const now = new Date();
    const opens = await (prisma as any).taskWorkSession.findMany({
      where: { taskId, endedAt: null },
    });
    if (opens.length > 0) {
      await prisma.$transaction(
        opens.map((o: any) =>
          (prisma as any).taskWorkSession.update({
            where: { id: o.id },
            data: {
              endedAt: now,
              elapsedSec: Math.max(0, Math.round((now.getTime() - o.startedAt.getTime()) / 1000)),
              note: next === "IN_REVIEW" ? "auto-paused for approval review" : undefined,
            },
          })
        )
      );
    }
  }
  if (next === "BLOCKED") update.blocked = true;
  if (next !== "BLOCKED") update.blocked = false;
  if (reason != null) {
    update.blockerReason = next === "BLOCKED" ? reason : null;
    update.reworkReason = next === "IN_PROGRESS" && task.status === "DONE" ? reason : null;
  }

  const updated = await prisma.task.update({ where: { id: taskId }, data: update });

  if (task.status !== next) {
    const type =
      next === "DONE" ? "TASK_COMPLETED"
      : task.status === "DONE" ? "TASK_REOPENED"
      : "TASK_STATUS_CHANGED";
    await emitEvent({
      type,
      actorId: actorId ?? undefined,
      entityType: "task",
      entityId: taskId,
      payload: { from: task.status, to: next, code: task.code },
      topic: next === "DONE" ? "task.completed" : "task.status_changed",
    });
    if (task.assigneeId) {
      if (next === "DONE") {
        await notifyAssignee(task.assigneeId, "TASK_COMPLETED", {
          title: "Task completed",
          body: `${task.code} marked as done`,
          taskCode: task.code,
          taskId: task.id,
          action: "completed",
        });
      } else if (next === "BLOCKED") {
        await notifyAllLeadership("TASK_BLOCKED", {
          title: "Task blocked",
          body: `${task.code} is blocked: ${reason ?? "no reason given"}`,
          taskCode: task.code,
          taskId: task.id,
          action: "blocked",
        });
      }
    }
  }
  if (task.assigneeId && next !== "DONE" && isDueToday(task.dueDate)) {
    await notifyAssignee(task.assigneeId, "TASK_DUE_TODAY", {
      title: "Task due today",
      body: `${task.code} is due today`,
      taskCode: task.code,
      taskId: task.id,
      action: "due_today",
    });
  }
  return updated;
}

/** Edit task fields (permission-gated: assigner / assignee / leadership). */
export async function editTask(
  taskId: string,
  actorId: string,
  caps: Set<string>,
  patch: {
    title?: string;
    description?: string | null;
    priority?: "P0" | "P1" | "P2" | "P3";
    category?: "CALL" | "MEETING" | "SCREENING" | "BUG_FIX" | "DEVELOPMENT" | "DESIGN" | "CRM" | "ADMIN" | "DOCUMENTATION" | "OTHER";
    dueDate?: string | null;
    estimateHrs?: number | null;
    gainLever?: string | null;
    outcome?: string | null;
  }
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  // Only leadership (tasks.assign) or the assignee/creator may edit
  const isLeader = caps.has("tasks.assign");
  const isInvolved = task.assigneeId === actorId || task.creatorId === actorId;
  if (!isLeader && !isInvolved) {
    const err = new Error("You can only edit tasks you are assigned to or created.");
    (err as unknown as { status: number }).status = 403;
    throw err;
  }

  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) {
    data.description = patch.description?.trim() ?? null;
    data.descriptionBy = patch.description ? actorId : null; // author = whoever set it
  }
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.estimateHrs !== undefined) data.estimateHrs = patch.estimateHrs;
  if (patch.gainLever !== undefined) data.gainLever = patch.gainLever;
  // ACCOUNTABILITY: once outcome is set, only workspace admin can clear it
  if (patch.outcome !== undefined) {
    if (task.outcome && !patch.outcome?.trim() && !caps.has("workspace.admin")) {
      throw new Error("Cannot clear outcome on a completed task without workspace admin.");
    }
    data.outcome = patch.outcome ?? null;
  }
  if (patch.dueDate !== undefined) {
    if (patch.dueDate) {
      const dt = parseDueDate(patch.dueDate);
      if (!dt) throw new Error("Due date is not a valid date. Pick a calendar date or clear it.");
      data.dueDate = dt;
      data.dueLabel = dt.toDateString() === new Date().toDateString()
        ? "Today"
        : dt.toDateString() === new Date(Date.now() + 86400000).toDateString()
        ? "Tomorrow"
        : dt.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      data.dueDate = null;
      data.dueLabel = null;
    }
  }

  const updated = await prisma.task.update({ where: { id: taskId }, data });

  await emitEvent({
    type: "TASK_UPDATED",
    actorId,
    entityType: "task",
    entityId: taskId,
    payload: { code: task.code, patch: Object.keys(patch) },
    topic: "task.updated",
  });

  return updated;
}

/** Remove an assignee from a task. Edit-gated (assigner / self / leadership).
 * Closes any open session for (task, employee) first so time isn't left dangling,
 * deletes the TaskAssignee join row, and if the removed row was the primary
 * assignee, repoints the FK to the first remaining assignee (or null).
 */
export async function removeAssignee(taskId: string, employeeId: string, actorId: string, caps: Set<string>) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { select: { id: true } } },
  });
  if (!task) throw new Error("Task not found");

  // Hierarchical Access: Permitted for Senior Executives, Team Leads, Dept Heads, and Leadership (restricted for Executives, Interns, Contractors, and Client roles).
  const actor = await prisma.employee.findUnique({
    where: { id: actorId },
    select: { id: true, email: true, role: true },
  });

  const RESTRICTED_ROLES = ["EXECUTIVE", "INTERN", "EXTERNAL_CONTRACTOR", "CLIENT_ADMIN", "CLIENT_VIEWER"];
  const isAllowed = (actor?.role && !RESTRICTED_ROLES.includes(actor.role)) || caps.has("tasks.assign");

  if (!isAllowed) {
    const e = new Error("Task un-assignment is restricted to Senior Executives, Team Leads, Department Heads, and Leadership (not permitted for Executives or below).");
    (e as unknown as { status: number }).status = 403;
    throw e;
  }

  await prisma.$transaction(async (tx) => {
    // Close any open work session for the removed assignee on this task.
    const s = await (tx as any).taskWorkSession.findFirst({
      where: { taskId, assigneeId: employeeId, endedAt: null },
    });
    if (s) {
      const now = new Date();
      await (tx as any).taskWorkSession.update({
        where: { id: s.id },
        data: { endedAt: now, elapsedSec: Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 1000)), note: "assignee removed" },
      });
    }
    await tx.taskAssignee.delete({ where: { taskId_employeeId: { taskId, employeeId } } });
  });

  // If the removed row was the primary assignee, repoint to the first remaining one.
  if (task.assigneeId === employeeId) {
    const others = await ((prisma as any).taskAssignee.findMany({
      where: { taskId },
      select: { employeeId: true },
    }));
    await prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: others[0]?.employeeId ?? null },
    });
  }

  return { ok: true };
}

/** Archive (or unarchive) a task. Putting a task away ≠ deleting it: reads that
 * default to active tasks (deletedAt:null AND archivedAt:null) hide it, but it
 * remains restorable from the Archived view. Archiving closes any open sessions.
 */
export async function archiveTask(taskId: string, actorId: string, caps: Set<string>, archived: boolean) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { select: { id: true } } },
  });
  if (!task) throw new Error("Task not found");

  const isLeader = caps.has("tasks.assign");
  const co = (task as any).assignees?.some((a: { id: string }) => a.id === actorId);
  const isInvolved = co === true || task.assigneeId === actorId || task.creatorId === actorId;
  if (!isLeader && !isInvolved) {
    const e = new Error("You can only edit tasks you are assigned to or created.");
    (e as unknown as { status: number }).status = 403;
    throw e;
  }

  if (archived) {
    // Closing open sessions prevents a running timer on an archived task.
    const opens = await (prisma as any).taskWorkSession.findMany({ where: { taskId, endedAt: null } });
    const now = new Date();
    for (const o of opens) {
      await (prisma as any).taskWorkSession.update({
        where: { id: o.id },
        data: { endedAt: now, elapsedSec: Math.max(0, Math.round((now.getTime() - o.startedAt.getTime()) / 1000)), note: "auto-paused (archive)" },
      });
    }
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: archived ? new Date() : null },
  });

  return { ok: true };
}

export async function startWork(
  taskIdOrCode: string,
  actorId: string,
  caps: Set<string>
) {
  const task = await prisma.task.findFirst({
    where: {
      deletedAt: null,
      OR: taskLookupClauses(taskIdOrCode),
    },
    include: { assignees: { select: { id: true, employeeId: true } } },
  });
  if (!task) throw new Error("Task not found");
  const taskId = task.id;

  // Object-level guard (mirrors editTask): involved (assignee / co-assignee / creator)
  // or leadership may open/close work sessions on a task.
  const isLeader = caps.has("tasks.assign");
  const co = (task as any).assignees?.some((a: { employeeId?: string; id?: string }) => a.employeeId === actorId || a.id === actorId);
  const isInvolved = co === true || task.assigneeId === actorId || task.creatorId === actorId;
  if (!isLeader && !isInvolved) {
    const guardErr = new Error("You can only track time on tasks you are assigned to or created.");
    (guardErr as unknown as { status: number }).status = 403;
    throw guardErr;
  }

  // Single-track: at most ONE open session per employee across all tasks.
  // Starting a task auto-pauses any other task this employee is running, so
  // the 8h meter never double-counts a clock-hour.
  const openElsewhere = await (prisma as any).taskWorkSession.findFirst({
    where: { assigneeId: actorId, endedAt: null, taskId: { not: taskId } },
  });
  if (openElsewhere) {
    const now = new Date();
    const elapsed = Math.round((now.getTime() - openElsewhere.startedAt.getTime()) / 1000);
    await (prisma as any).taskWorkSession.update({
      where: { id: openElsewhere.id },
      data: { endedAt: now, elapsedSec: elapsed, note: "auto-paused (single-track)" },
    });
    // T8: a task inside the caller's OPEN focus block must not be dragged back to To
    // do here. Every task in a block is IN_PROGRESS by definition, and moving the timer
    // between them is done inside the block (switch), not by resetting siblings.
    // Ending the block is the explicit action that applies the end-of-block statuses.
    const openBlock = await (prisma as any).focusBlock.findFirst({
      where: { employeeId: actorId, endedAt: null },
      select: { taskIds: true },
    });
    const inOpenBlock = !!openBlock && (openBlock.taskIds as string[]).includes(openElsewhere.taskId);
    if (!inOpenBlock) {
      // Auto-stopped sibling must stop showing as running: mirror a manual pause (status->TODO, clear startedAt).
      await prisma.task.update({
        where: { id: openElsewhere.taskId },
        data: { status: "TODO", startedAt: null },
      }).catch(() => {});
    }
  }

  // Check for existing open session on THIS task
  const open = await (prisma as any).taskWorkSession.findFirst({
    where: { taskId, assigneeId: actorId, endedAt: null },
  });
  if (open) return; // already running

  await (prisma as any).taskWorkSession.create({
    data: { taskId, assigneeId: actorId },
  });

  await emitEvent({
    type: "TASK_STARTED",
    actorId,
    entityType: "task",
    entityId: taskId,
    payload: { code: task.code },
    topic: "task.started",
  });

  // Auto-resume shift / preempt active break when starting work on a task
  await prisma.employee.update({
    where: { id: actorId },
    data: { shiftPaused: false, shiftPauseReason: null, shiftPausedAt: null },
  }).catch(() => {});

  // Ensure task status is IN_PROGRESS. Reopening a DONE task resets the clock
  // (clears completedAt + fresh startedAt) so the running timer never spans the
  // old DONE interval; otherwise a brand-new start would read as hours of work.
  if (task.status === "DONE") {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", completedAt: null, startedAt: new Date() },
    });
  } else if (task.status !== "IN_PROGRESS") {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? new Date() },
    });
  }
}

/**
 * Pause work on a task — closes the open TaskWorkSession (freezes elapsedSec).
 * Optional reason stored as a note.
 */
export async function pauseTask(
  taskIdOrCode: string,
  actorId: string,
  caps: Set<string>,
  reason?: string | null
) {
  let task = await prisma.task.findFirst({
    where: {
      deletedAt: null,
      OR: taskLookupClauses(taskIdOrCode),
    },
    include: { assignees: { select: { id: true, employeeId: true } } },
  });

  // If not found by ID/Code, check if actor has an open work session currently running
  if (!task) {
    const openSession = await (prisma as any).taskWorkSession.findFirst({
      where: { assigneeId: actorId, endedAt: null },
      include: { task: { include: { assignees: { select: { id: true, employeeId: true } } } } },
    });
    if (openSession?.task) {
      task = openSession.task;
    }
  }

  if (!task) throw new Error("Task not found");
  const taskId = task.id;

  // Object-level guard (mirrors editTask). Co-assignees count as involved.
  const isLeader = caps.has("tasks.assign");
  const co = (task as any).assignees?.some((a: { employeeId?: string; id?: string }) => a.employeeId === actorId || a.id === actorId);
  const isInvolved = co === true || task.assigneeId === actorId || task.creatorId === actorId;
  if (!isLeader && !isInvolved) {
    const guardErr = new Error("You can only track time on tasks you are assigned to or created.");
    (guardErr as unknown as { status: number }).status = 403;
    throw guardErr;
  }

  // Close ALL open work sessions for this actor to guarantee no timer leaks
  const openSessions = await (prisma as any).taskWorkSession.findMany({
    where: { assigneeId: actorId, endedAt: null },
  });
  let totalElapsedSec = 0;
  for (const open of openSessions) {
    const now = new Date();
    const elapsedSec = Math.round((now.getTime() - open.startedAt.getTime()) / 1000);
    totalElapsedSec += elapsedSec;
    await (prisma as any).taskWorkSession.update({
      where: { id: open.id },
      data: { endedAt: now, elapsedSec, note: reason ?? null },
    });
    if (open.taskId) {
      await prisma.task.update({
        where: { id: open.taskId },
        data: { status: "TODO", startedAt: null },
      }).catch(() => {});
    }
  }

  // Always reset task status to TODO and clear startedAt when pausing
  if (task.status === "IN_PROGRESS") {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "TODO", startedAt: null },
    }).catch(() => {});
  }

  await emitEvent({
    type: "TASK_PAUSED",
    actorId,
    entityType: "task",
    entityId: taskId,
    payload: { code: task.code, elapsedSec: totalElapsedSec, reason: reason ?? null },
    topic: "task.paused",
  });
}

/** Resolve the description author's display name for a fetched TaskWith. */
function resolveDescAuthor(t: TaskWith): string | null {
  const byId = t.descriptionBy;
  if (!byId) return null;
  // Exact match on assignees or creator rels already fetched.
  if (t.assignees?.some((a) => a.employee.id === byId)) return t.assignees.find((a) => a.employee.id === byId)!.employee.name;
  if (t.creator?.id === byId) return t.creator.name;
  return null;
}
