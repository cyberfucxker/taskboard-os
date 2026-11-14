import { runAutomationTick } from "./services/automationEngine";
import { sendDueFollowUpReminders } from "./services/followUpReminders";
import { runAiSdrDuePass } from "./services/aiSdrEngine";
import { runUnscoped } from "./services/requestContext";

/**
 * One iteration of the CRM's background work.
 *
 * The legacy CRM ran each of these on its own in-process setInterval, started from index.ts
 * (startAutomationPoller, startFollowUpReminderPoller, ...). TaskBoard does not run timers inside the
 * Next.js process — a deploy or crash silently kills them — so the same work is exposed as a
 * single pass, driven from outside by POST /api/cron/crm-tick (src/app/api/cron/crm-tick).
 *
 * Every step is idempotent (runs and reminders are claimed before they act), so an overlapping or
 * repeated tick is safe. Each step is isolated: one failing does not stop the others, and the
 * failure is reported in the summary rather than swallowed, so the caller can alert on it.
 *
 * Deliberately absent: the legacy CRM's email-sequence poller (sequences were not ported) and its
 * partner-app notification poller (TaskBoard's alertEmployee delivers immediately).
 */
export async function runCrmTick(): Promise<Record<string, unknown>> {
  const startedAt = new Date();
  const summary: Record<string, unknown> = { startedAt: startedAt.toISOString() };
  const errors: Record<string, string> = {};

  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      summary[name] = await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[name] = message;
      console.error(`[crm] tick step ${name} failed:`, err);
    }
  };

  // The tick acts as the system: nothing here is narrowed to a person's data scope.
  await runUnscoped(async () => {
    await step("automations", runAutomationTick);
    await step("followUpReminders", sendDueFollowUpReminders);
    await step("aiSdr", runAiSdrDuePass);
  });

  summary.durationMs = Date.now() - startedAt.getTime();
  summary.ok = Object.keys(errors).length === 0;
  if (!summary.ok) summary.errors = errors;
  return summary;
}
