import { prisma } from "@/lib/db";

/**
 * Minimal real-time event bus component.
 *
 * Hooks into server-side task-lifecycle events (and friends) and pushes
 * notifications to connected desktop agents through the existing
 * DeviceCommand mechanism. Each notification is a synchronous DB write
 * (`DeviceCommand` with `type = 'NOTIFICATION'`, `status = 'PENDING'`); the
 * agent's polling loop picks it up and shows it to the user. Call any of these
 * functions from any server-side code path.
 */

/**
 * Build the canonical notification payload shape consumed by the desktop agent.
 */
function buildPayload(eventType: string, payload: object): object {
  const now = new Date().toISOString();
  const t = (payload as { timestamp?: string }).timestamp;
  return { eventType, ...payload, timestamp: t ?? now };
}

/**
 * #1 — Push a NOTIFICATION command to a single device.
 * Synchronous; call from anywhere server-side.
 */
export async function notifyAgent(
  eventType: string,
  payload: object,
  deviceId: string
): Promise<void> {
  if (!deviceId) return;
  await prisma.deviceCommand.create({
    data: {
      deviceId,
      type: "NOTIFICATION",
      status: "PENDING",
      payload: buildPayload(eventType, payload),
    },
  });
}

/**
 * #2 — Push a NOTIFICATION command to ALL active devices of every
 * SUPER_ADMIN / DEPARTMENT_HEAD employee.
 */
export async function notifyAllLeadership(
  eventType: string,
  payload: object
): Promise<void> {
  const devices = await prisma.device.findMany({
    where: {
      deletedAt: null,
      employee: {
        role: { in: ["SUPER_ADMIN", "DEPARTMENT_HEAD"] },
      },
    },
    select: { id: true },
  });

  for (const { id } of devices) {
    await prisma.deviceCommand.create({
      data: {
        deviceId: id,
        type: "NOTIFICATION",
        status: "PENDING",
        payload: buildPayload(eventType, payload),
      },
    });
  }
}

/**
 * #3 — Push a NOTIFICATION command to all active devices of one employee.
 */
export async function notifyAssignee(
  assigneeId: string,
  eventType: string,
  payload: object
): Promise<void> {
  if (!assigneeId) return;
  const devices = await prisma.device.findMany({
    where: { employeeId: assigneeId, deletedAt: null },
    select: { id: true },
  });

  for (const { id } of devices) {
    await prisma.deviceCommand.create({
      data: {
        deviceId: id,
        type: "NOTIFICATION",
        status: "PENDING",
        payload: buildPayload(eventType, payload),
      },
    });
  }
}

export default { notifyAgent, notifyAllLeadership, notifyAssignee };