import { alertEmployee } from "@/lib/alerting";

/**
 * the legacy CRM's notify() recorded a notification and pushed it to the partner app. In TaskBoard the
 * same job belongs to alertEmployee(): the in-app bell plus a browser push. Audience groups
 * (all agents, all leaders) have no TaskBoard meaning, so only explicit `userIds` are delivered.
 */
export interface NotifyInput {
  title: string;
  body: string;
  type?: string;
  audience?: string;
  userIds?: string[];
  data?: Record<string, string>;
  createdBy?: string | null;
}

export interface NotifyResult {
  notificationId: string;
  recipients: number;
  pushed: number;
  pushFailed: number;
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const ids = [...new Set(input.userIds ?? [])];
  let failed = 0;
  for (const employeeId of ids) {
    try {
      await alertEmployee({
        employeeId,
        title: input.title,
        detail: input.body,
        kind: "alert",
        severity: "Info",
        url: input.data?.url ?? (input.data?.leadId ? `/crm/leads/${input.data.leadId}` : "/crm"),
      });
    } catch {
      failed += 1;
    }
  }
  return { notificationId: "taskboard-alert", recipients: ids.length, pushed: ids.length - failed, pushFailed: failed };
}
