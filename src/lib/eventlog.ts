import { prisma } from "@/lib/db";
import { ActivityType, Prisma } from "@prisma/client";

/**
 * Event log — the append-only substrate for the KPI engine (§15) and AI
 * agents (§16). Every meaningful action emits a typed, immutable Activity.
 * Current state is derived from state tables; the log records what happened.
 *
 * `emitEvent` writes the Activity AND a durable Outbox row in one
 * transaction. A background worker (Phase: integration hub, CORE-08) later
 * publishes Outbox rows to webhooks / n8n / MCP listeners and stamps
 * `publishedAt`. External systems and AI agents subscribe to the Outbox —
 * they never call operational code.
 *
 * DM-07: the Activity table is append-only. Nothing ever updates or deletes
 * a row here. `publishedAt` on Outbox is the only mutable field, and that is
 * not an Activity.
 */
export interface EmitEventInput {
  type: ActivityType;
  actorId?: string | null;
  entityType: string; // \task\' | \lead\' | \client\' | ...
  entityId: string;
  clientId?: string | null; // tenant scoping (P5)
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  /** When set, also enqueue an Outbox publish for external/MCP listeners. */
  topic?: string;
}

export async function emitEvent<T extends Record<string, unknown>>(
  input: EmitEventInput
): Promise<{ id: string }> {
  const {
    type,
    actorId = null,
    entityType,
    entityId,
    clientId = null,
    payload = {},
    meta = {},
    topic,
  } = input;

  const result = await prisma.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        type,
        actorId,
        entityType,
        entityId,
        clientId,
        payload: { v: 1, ...payload } as Prisma.InputJsonValue,
        meta: meta as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    if (topic) {
      await tx.outbox.create({
        data: {
          activityId: activity.id,
          topic,
          payload: { v: 1, ...payload },
        },
      });
    }

    return activity;
  });

  // ── Phase 3: create in-app notifications for task events (best-effort) ──
  if (entityType === "task") {
    try {
      const p = payload as Record<string, unknown>;
      const task = await prisma.task.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          code: true,
          title: true,
          priority: true,
          creatorId: true,
          assignees: { select: { employeeId: true } },
        },
      });
      if (task !== null && (p.code || task.code)) {
        await createNotificationsForEvent(input, {
          id: task.id,
          code: String(p.code ?? task.code),
          title: task.title,
          priority: task.priority,
          creatorId: task.creatorId,
          assigneeIds: task.assignees.map((a) => a.employeeId),
        });
      }
    } catch {
      // Notification creation is best-effort — never block the event log.
    }
  }

  return result;
}

// --- Notification wiring (Phase 3: Jira-class features) ---
async function createNotificationsForEvent(
  input: EmitEventInput,
  taskData: {
    id: string;
    code: string;
    title: string;
    priority: string;
    creatorId: string | null;
    assigneeIds: string[];
  }
) {
  const { type, actorId } = input;
  const { code, title, priority, creatorId, assigneeIds } = taskData;

  const severity =
    priority === "P0" || priority === "P1"
      ? "Critical"
      : priority === "P2"
      ? "High"
      : "Info";
  const kind = "alert";

  const notes: { employeeId: string; title: string; detail: string }[] = [];

  switch (type) {
    case "TASK_CREATED":
      for (const eid of assigneeIds) {
        if (eid !== actorId)
          notes.push({ employeeId: eid, title: "New task assigned to you", detail: `[${code}] ${title}` });
      }
      break;
    case "TASK_COMPLETED":
      if (creatorId && creatorId !== actorId)
        notes.push({ employeeId: creatorId, title: "Task completed", detail: `[${code}] ${title}` });
      for (const eid of assigneeIds) {
        if (eid !== actorId)
          notes.push({ employeeId: eid, title: "Task marked done", detail: `[${code}] ${title}` });
      }
      break;
    case "TASK_REOPENED":
      for (const eid of assigneeIds) {
        if (eid !== actorId)
          notes.push({ employeeId: eid, title: "Task reopened", detail: `[${code}] ${title}` });
      }
      break;
    case "TASK_REWORK":
      for (const eid of assigneeIds) {
        if (eid !== actorId)
          notes.push({ employeeId: eid, title: "Rework requested on task", detail: `[${code}] ${title} — rework requested with feedback` });
      }
      break;
    case "TASK_STATUS_CHANGED": {
      const to = String((input.payload as Record<string, unknown>)?.to ?? "unknown");
      if (to === "IN_REVIEW") {
        if (creatorId && creatorId !== actorId)
          notes.push({ employeeId: creatorId, title: "Task submitted for review", detail: `[${code}] ${title} is ready for review and sign-off` });
      } else {
        if (creatorId && creatorId !== actorId)
          notes.push({ employeeId: creatorId, title: "Task status changed", detail: `[${code}] ${title} → ${to}` });
        for (const eid of assigneeIds) {
          if (eid !== actorId)
            notes.push({ employeeId: eid, title: "Task status changed", detail: `[${code}] ${title} → ${to}` });
        }
      }
      break;
    }
    case "TASK_STARTED":
      if (creatorId && creatorId !== actorId)
        notes.push({ employeeId: creatorId, title: "Work started on task", detail: `[${code}] ${title}` });
      break;
    case "TASK_PAUSED":
      if (creatorId && creatorId !== actorId)
        notes.push({ employeeId: creatorId, title: "Work paused on task", detail: `[${code}] ${title}` });
      break;
    case "TASK_UPDATED":
      for (const eid of assigneeIds) {
        if (eid !== actorId)
          notes.push({ employeeId: eid, title: "Task updated", detail: `[${code}] ${title}` });
      }
      break;
    default:
      return;
  }

  // Deduplicate: one note per employee.
  const seen = new Set<string>();
  const unique = notes.filter((n) => {
    if (seen.has(n.employeeId)) return false;
    seen.add(n.employeeId);
    return true;
  });

  if (unique.length > 0) {
    await prisma.notification.createMany({
      data: unique.map((n) => ({
        employeeId: n.employeeId,
        title: n.title,
        detail: n.detail,
        severity,
        kind,
      })),
    });
  }
}

/**
 * Publish pending Outbox rows (called by a scheduler/worker). Implements a
 * simple at-least-once loop with an attempt counter and exponential backoff
 * signal. Returns how many rows were published this run.
 *
 * This function is the single place an external integration (n8n webhook,
 * MCP server, AI event listener) is invoked from — keep all side effects
 * behind the `handler` so the integration layer stays swappable (ARCH-06).
 */
export async function drainOutbox(handler: (row: unknown) => Promise<void>) {
  const pending = await prisma.outbox.findMany({
    where: { publishedAt: null, attempts: { lt: 10 } },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { activity: true },
  });

  let published = 0;
  for (const row of pending) {
    try {
      await handler(row);
      await prisma.outbox.update({
        where: { id: row.id },
        data: { publishedAt: new Date(), attempts: { increment: 1 } },
      });
      published += 1;
    } catch (err) {
      await prisma.outbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
  return published;
}
