import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createTask } from "@/lib/tasks";
import { verifyCronSecret } from "@/lib/cron-auth";
import { istDayStart, istDateKey, istDayOfWeek } from "@/lib/time";

export const dynamic = "force-dynamic";

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * POST /api/recurring-tasks/generate
 *
 * Internal-only, unauthenticated (same convention as /api/tasks/overdue-check
 * and /api/standup/check — cron calls it over localhost, not reachable with a
 * session). Run once a day, early morning.
 *
 * For every active template whose scheduledDays includes today, creates one
 * real Task — but only if it hasn't already generated one today. Idempotent
 * via `lastTriggeredAt`: if that's already today (server-local date), skip.
 * Safe to run more than once a day or after a restart without duplicating.
 */
export async function POST(req: Request) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  // getDay() is the SERVER's weekday (America/Denver), not IST. On Sundays
  // the two disagree, so templates would fire a day early/late or be skipped.
  const today = istDayStart(new Date());
  const todayCode = DAY_CODES[istDayOfWeek(new Date())];
  const todayDateStr = istDateKey(today);

  const templates = await (prisma as any).recurringTaskTemplate.findMany({
    where: { isActive: true },
  });

  const results: { templateId: string; title: string; status: string; taskCode?: string; error?: string }[] = [];

  // Fall back to the org's first SUPER_ADMIN as creator when a template has no
  // assignee to self-assign as (createTask requires a creatorId, and assigning
  // to someone else requires canAssign — leadership can always do that).
  let systemCreatorId: string | null = null;

  for (const t of templates) {
    try {
      const scheduledDays: string[] = Array.isArray(t.scheduledDays) ? t.scheduledDays : [];
      if (!scheduledDays.includes(todayCode)) {
        continue;
      }

      const lastTriggered = t.lastTriggeredAt ? istDateKey(new Date(t.lastTriggeredAt)) : null;
      if (lastTriggered === todayDateStr) {
        results.push({ templateId: t.id, title: t.title, status: "already_run_today" });
        continue;
      }

      let creatorId = t.assigneeId as string | null;
      let canAssign = false;
      if (!creatorId) {
        if (!systemCreatorId) {
          const admin = await prisma.employee.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
          systemCreatorId = admin?.id || null;
        }
        creatorId = systemCreatorId;
        canAssign = true;
      } else {
        canAssign = true; // self-assigning is always allowed
      }

      if (!creatorId) {
        results.push({ templateId: t.id, title: t.title, status: "error", error: "No assignee on template and no SUPER_ADMIN found to own the generated task" });
        continue;
      }

      const task = await createTask({
        title: t.title,
        description: t.description || undefined,
        // Templates seeded by an old script carry HIGH/URGENT/MEDIUM/LOW, which the Task
        // Priority enum (P0–P3) rejects — every such template failed daily. Normalise here too.
        priority: (({ URGENT: "P0", CRITICAL: "P0", HIGH: "P1", MEDIUM: "P2", NORMAL: "P2", LOW: "P3" } as Record<string, string>)[String(t.priority).toUpperCase()] ?? (/^P[0-3]$/.test(String(t.priority)) ? t.priority : "P2")) as "P0" | "P1" | "P2" | "P3",
        assigneeId: t.assigneeId || undefined,
        creatorId,
        canAssign,
      });

      if (Array.isArray(t.subtasks) && t.subtasks.length > 0) {
        await prisma.subtask.createMany({
          data: t.subtasks.map((s: any) => ({
            taskId: task.id,
            title: typeof s === "string" ? s : s.title || "Subtask",
          })),
        });
      }

      await (prisma as any).recurringTaskTemplate.update({
        where: { id: t.id },
        data: { lastTriggeredAt: today },
      });

      results.push({ templateId: t.id, title: t.title, status: "created", taskCode: task.code });
    } catch (err: any) {
      results.push({ templateId: t.id, title: t.title, status: "error", error: err.message });
    }
  }

  // A template that failed is a failure: say so with a non-200, so the systemd unit and anyone
  // reading the journal can tell a dead generator from a healthy one (it used to report 200).
  const failed = results.filter((r: { status?: string }) => r.status === "error").length;
  return NextResponse.json({ ok: failed === 0, date: todayDateStr, day: todayCode, failed, results }, { status: failed ? 500 : 200 });
}
