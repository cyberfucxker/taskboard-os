import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/eventlog";
import { MAX_BLOCK_TASKS, blockElapsedMs } from "@/lib/focus-clock";
import type { BlockTaskView, FocusBlockView } from "@/lib/focus-clock";

// Re-exported so server callers keep one import path, and so the header chip can pull
// the pure half without dragging prisma into the browser bundle.
export { MAX_BLOCK_TASKS, blockElapsedMs };
export type { BlockTaskView, FocusBlockView };

/**
 * T8 — Focus block.
 *
 * Staff juggling several jobs used to have to stop one task, find the next one and
 * start it, every single time they switched. A focus block lets them pick up to 3
 * tasks, rank them 1-2-3 and run ONE combined timer over all of them.
 *
 * The invariants this file exists to hold:
 *  - **Single-track is never broken.** Exactly one open TaskWorkSession per employee,
 *    always on the block's activeTaskId. Switching closes one and opens the other.
 *  - **No time is invented.** Per-task time is still the sum of that task's own
 *    TaskWorkSession rows, so the 8h meter, TimeLog and reports are unchanged.
 *  - **Block tasks stay IN_PROGRESS.** Being in a block is not the same as being
 *    actively worked, so nothing resets a sibling to TODO while the block is open.
 *  - One open block per employee, enforced in the database as well
 *    (FocusBlock_one_open_per_employee partial unique index).
 */

export type EndChoice = "done" | "in_progress" | "todo";

export class FocusBlockError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "FocusBlockError";
    this.status = status;
  }
}

type MaybeTask = {
  id: string;
  code: string;
  status: string;
  startedAt: Date | null;
  assigneeId: string | null;
  creatorId: string | null;
  assignees: { employeeId: string }[];
};

/** Trim, drop blanks, de-duplicate. The resulting order IS the rank the user tapped. */
export function normaliseTaskIds(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function assertBlockSize(ids: string[]): void {
  if (ids.length === 0) {
    throw new FocusBlockError("Pick at least one task for a focus block.", 400);
  }
  if (ids.length > MAX_BLOCK_TASKS) {
    throw new FocusBlockError(`A focus block holds up to ${MAX_BLOCK_TASKS} tasks.`, 400);
  }
}

/** Same object-level guard as startWork: involved (owner / co-assignee / creator) or leadership. */
function assertMayTrack(task: MaybeTask, actorId: string, caps: Set<string>): void {
  const isLeader = caps.has("tasks.assign");
  const isCoAssignee = task.assignees.some((a) => a.employeeId === actorId);
  const isInvolved = isCoAssignee || task.assigneeId === actorId || task.creatorId === actorId;
  if (!isLeader && !isInvolved) {
    throw new FocusBlockError(
      "You can only track time on tasks you are assigned to or created.",
      403
    );
  }
}

function elapsedSecSince(startedAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));
}

/** Close every open session for this employee — the single-track guarantee. */
async function closeOpenSessions(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  actorId: string,
  note: string,
  now: Date
): Promise<number> {
  const open = await tx.taskWorkSession.findMany({
    where: { assigneeId: actorId, endedAt: null },
  });
  for (const session of open) {
    await tx.taskWorkSession.update({
      where: { id: session.id },
      data: { endedAt: now, elapsedSec: elapsedSecSince(session.startedAt, now), note },
    });
  }
  return open.length;
}

async function loadTasks(ids: string[]): Promise<Map<string, MaybeTask>> {
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: { assignees: { select: { employeeId: true } } },
  });
  return new Map(tasks.map((t) => [t.id, t as unknown as MaybeTask]));
}

/**
 * Open (or replace) the employee's focus block.
 *
 * DONE tasks are skipped rather than silently reopened. Starting a block while one
 * is already open closes the old one first, so there is never more than one.
 */
export async function startBlock(
  rawTaskIds: unknown,
  actorId: string,
  caps: Set<string>
): Promise<FocusBlockView> {
  const ids = normaliseTaskIds(rawTaskIds);
  assertBlockSize(ids);

  const byId = await loadTasks(ids);
  if (byId.size !== ids.length) {
    throw new FocusBlockError("One of those tasks no longer exists.", 400);
  }
  for (const id of ids) assertMayTrack(byId.get(id)!, actorId, caps);

  const usable = ids.filter((id) => byId.get(id)!.status !== "DONE");
  if (usable.length === 0) {
    throw new FocusBlockError("Those tasks are already done.", 400);
  }
  const skipped = ids.filter((id) => !usable.includes(id));

  const activeTaskId = usable[0];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const openBlock = await tx.focusBlock.findFirst({
      where: { employeeId: actorId, endedAt: null },
    });
    await closeOpenSessions(tx, actorId, openBlock ? "focus block replaced" : "focus block start", now);
    if (openBlock) {
      await tx.focusBlock.update({ where: { id: openBlock.id }, data: { endedAt: now } });
    }

    await tx.focusBlock.create({
      data: { employeeId: actorId, taskIds: usable, activeTaskId, startedAt: now },
    });
    await tx.taskWorkSession.create({
      data: { taskId: activeTaskId, assigneeId: actorId, startedAt: now },
    });

    // Every task in the block is IN_PROGRESS, not just the active one: the user said
    // they are working these. Switching later must not reset its siblings.
    for (const id of usable) {
      const task = byId.get(id)!;
      if (task.status !== "IN_PROGRESS") {
        await tx.task.update({
          where: { id },
          data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? now },
        });
      }
    }
  });

  await emitEvent({
    type: "TASK_STARTED",
    actorId,
    entityType: "task",
    entityId: activeTaskId,
    payload: { focusBlock: true, taskIds: usable, skipped },
    topic: "task.started",
  });

  const view = await getOpenBlock(actorId);
  if (!view) throw new FocusBlockError("The focus block did not open.", 500);
  return view;
}

/** Move the block's single open session to another task in the block. One transaction. */
export async function switchActive(
  taskId: string,
  actorId: string,
  caps: Set<string>
): Promise<FocusBlockView> {
  const block = await prisma.focusBlock.findFirst({
    where: { employeeId: actorId, endedAt: null },
  });
  if (!block) throw new FocusBlockError("No focus block is open.", 404);
  if (!block.taskIds.includes(taskId)) {
    throw new FocusBlockError("That task is not in your focus block.", 400);
  }
  if (block.activeTaskId === taskId) {
    const current = await getOpenBlock(actorId);
    if (current) return current;
  }

  const byId = await loadTasks([taskId]);
  const task = byId.get(taskId);
  if (!task) throw new FocusBlockError("That task no longer exists.", 400);
  assertMayTrack(task, actorId, caps);
  if (task.status === "DONE") {
    throw new FocusBlockError("That task is already done.", 400);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await closeOpenSessions(tx, actorId, "focus switch", now);
    await tx.focusBlock.update({ where: { id: block.id }, data: { activeTaskId: taskId } });
    await tx.taskWorkSession.create({
      data: { taskId, assigneeId: actorId, startedAt: now },
    });
    if (task.status !== "IN_PROGRESS") {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? now },
      });
    }
  });

  await emitEvent({
    type: "TASK_STARTED",
    actorId,
    entityType: "task",
    entityId: taskId,
    payload: { focusBlock: true, focusSwitch: true, blockId: block.id },
    topic: "task.started",
  });

  const view = await getOpenBlock(actorId);
  if (!view) throw new FocusBlockError("The focus block did not open.", 500);
  return view;
}

const END_CHOICES: readonly EndChoice[] = ["done", "in_progress", "todo"];

/**
 * Close the open session and the block, then apply the per-task outcome the user
 * picked in the end-of-block sheet. Default: the task that was active stays
 * IN_PROGRESS, the rest fall back to To do — leaving an untouched sibling looking
 * "in progress" would be a lie.
 */
export async function endBlock(
  actorId: string,
  caps: Set<string>,
  choices?: Record<string, EndChoice> | null
): Promise<{ id: string; startedAt: string; endedAt: string; tasks: { taskId: string; status: EndChoice }[] }> {
  const block = await prisma.focusBlock.findFirst({
    where: { employeeId: actorId, endedAt: null },
  });
  if (!block) throw new FocusBlockError("No focus block is open.", 404);

  const byId = await loadTasks(block.taskIds);
  for (const id of block.taskIds) {
    const task = byId.get(id);
    if (task) assertMayTrack(task, actorId, caps);
  }

  const now = new Date();
  const applied: { taskId: string; status: EndChoice }[] = [];

  await prisma.$transaction(async (tx) => {
    await closeOpenSessions(tx, actorId, "focus block ended", now);
    await tx.focusBlock.update({ where: { id: block.id }, data: { endedAt: now } });

    for (const taskId of block.taskIds) {
      const existing = byId.get(taskId);
      const requested = choices?.[taskId];
      const choice: EndChoice =
        requested && END_CHOICES.includes(requested)
          ? requested
          : taskId === block.activeTaskId
            ? "in_progress"
            : "todo";

      // Never drag an already-DONE task back to TODO by accident.
      if (existing?.status === "DONE" && choice !== "done") {
        applied.push({ taskId, status: "done" });
        continue;
      }

      if (choice === "done") {
        await tx.task.update({ where: { id: taskId }, data: { status: "DONE", completedAt: now } });
      } else if (choice === "todo") {
        await tx.task.update({ where: { id: taskId }, data: { status: "TODO", startedAt: null } });
      } else {
        await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
      }
      applied.push({ taskId, status: choice });
    }
  });

  await emitEvent({
    type: "TASK_PAUSED",
    actorId,
    entityType: "task",
    entityId: block.activeTaskId,
    payload: { focusBlock: true, ended: true, blockId: block.id, applied },
    topic: "task.paused",
  });

  return {
    id: block.id,
    startedAt: block.startedAt.toISOString(),
    endedAt: now.toISOString(),
    tasks: applied,
  };
}

/** The employee's open block with its ranked task list, or null. */
export async function getOpenBlock(employeeId: string): Promise<FocusBlockView | null> {
  const block = await prisma.focusBlock.findFirst({
    where: { employeeId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!block) return null;

  const tasks = await prisma.task.findMany({
    where: { id: { in: block.taskIds }, deletedAt: null },
    select: { id: true, code: true, title: true, status: true },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return {
    id: block.id,
    employeeId: block.employeeId,
    startedAt: block.startedAt.toISOString(),
    activeTaskId: block.activeTaskId,
    taskIds: block.taskIds,
    tasks: block.taskIds.map((id, index) => ({
      id,
      rank: index + 1,
      code: byId.get(id)?.code ?? "",
      title: byId.get(id)?.title ?? "Deleted task",
      status: byId.get(id)?.status ?? "TODO",
    })),
  };
}
