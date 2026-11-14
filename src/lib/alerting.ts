import { prisma } from "@/lib/db";
import { sendPushToEmployee } from "@/lib/push";
import { emitEvent } from "@/lib/eventlog";

/**
 * Alert-engine backbone.
 *
 * For every material work action (start / pause / complete / re-open / block),
 * we surface a notification AND a capture:
 *   - notification row  -> the in-app bell (kind: "alert")
 *   - optional push     -> browser push to that employee's devices (no-op if unset)
 *   - optional capture  -> an Activity event "I did something" that leadership/HR
 *                          later read as the honest performance record.
 *
 * The design intent (per ALEX): the alert prompts the employee to close the loop on
 * work they already own, and the *capture* is a side effect the employee chose —
 * not a meter nagging them to log hours. Leadership/HR measure on shipped outcomes
 * (captured Activity), not raw hours.
 */
export async function alertEmployee(opts: {
  employeeId: string;
  title: string;
  detail: string;
  kind?: string; // "alert" | "blocker" | "digest" | "sla"
  severity?: string; // "Info" | "High"
  url?: string;
  /** Send a browser (web) push to this employee too. */
  notify?: boolean;
  /** Record an Activity stream event (the honest performance log). */
  capture?: {
    type: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  };
}): Promise<void> {
  const { employeeId, title, detail, kind = "alert", severity = "Info", url } = opts;

  // 1) In-app bell
  await prisma.notification.create({
    data: { employeeId, title, detail, kind, severity },
  });

  // 2) Browser push (fire-and-forget; no-op if VAPID not configured)
  if (opts.notify || kind === "alert") {
    await sendPushToEmployee(employeeId, {
      title,
      body: detail,
      url: url ?? undefined,
    }).catch(() => {});
  }

  // 3) Honest capture (the stream leadership/HR measure on)
  if (opts.capture) {
    const c = opts.capture;
    await emitEvent({
      type: c.type as never,
      actorId: employeeId,
      entityType: c.entityType,
      entityId: c.entityId,
      payload: c.payload,
    }).catch(() => {});
  }
}