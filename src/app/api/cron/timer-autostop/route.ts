import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { alertEmployee } from "@/lib/alerting";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/timer-autostop — stops every work timer left running past the shift.
 *
 * The shift ends 18:30 IST (owner-confirmed 09:30–18:30). People forget to stop TaskBoard timers,
 * which showed them as "currently working" all night and credited them with hours nobody
 * worked. Run by `taskboard-cron-timer-autostop.timer` at 18:30 IST and again at 23:55 IST.
 *
 * Every open TaskWorkSession is closed at 18:30 IST *of the day it started*, so time after the
 * shift is never counted; a session started after 18:30 closes with 0 seconds (after-hours time
 * is not credited — log it manually if it was real work). Its task goes back to TODO exactly as
 * a normal pause does (lib/tasks.ts pauseTask), a note records why, and the person gets an alert
 * so they know their day's log was closed for them.
 *
 * `?dryRun=1` reports what would be stopped without writing anything.
 */
const SHIFT_END_MS = (18 * 60 + 30) * 60 * 1000;
const NOTE = "Auto-stopped at shift end (18:30 IST): timer was left running; time after 18:30 not counted.";

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("x-cron-secret") ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const now = new Date();

  const open = await prisma.taskWorkSession.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      startedAt: true,
      assigneeId: true,
      taskId: true,
      task: { select: { code: true, title: true } },
    },
  });

  const stopped: { employeeId: string; task: string; countedSec: number; endedAt: string }[] = [];
  for (const s of open) {
    const shiftEnd = new Date(istDayStart(s.startedAt).getTime() + SHIFT_END_MS);
    // Leave alone anything whose shift has not ended yet (a timer started this morning, before
    // the 18:30 run fires). Everything else is past its shift and gets closed.
    if (now < shiftEnd) continue;
    const endedAt = s.startedAt > shiftEnd ? s.startedAt : shiftEnd;
    const countedSec = Math.max(0, Math.round((endedAt.getTime() - s.startedAt.getTime()) / 1000));
    stopped.push({ employeeId: s.assigneeId, task: s.task?.code ?? s.taskId, countedSec, endedAt: endedAt.toISOString() });
    if (dryRun) continue;

    await prisma.$transaction([
      prisma.taskWorkSession.update({ where: { id: s.id }, data: { endedAt, elapsedSec: countedSec, note: NOTE } }),
      prisma.task.updateMany({ where: { id: s.taskId, status: "IN_PROGRESS" }, data: { status: "TODO", startedAt: null } }),
    ]);
    const hrs = (countedSec / 3600).toFixed(2);
    await alertEmployee({
      employeeId: s.assigneeId,
      title: `⏹ Timer auto-stopped: ${s.task?.code ?? "task"}`,
      detail: `Your timer on "${s.task?.title ?? "a task"}" was still running after 6:30 pm, so it was stopped at 6:30 pm. ${hrs} h counted. Please stop your timer before you leave.`,
      kind: "alert",
      severity: "Info",
      url: s.task?.code ? `/tasks?task=${encodeURIComponent(s.task.code)}` : "/time",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, dryRun, checked: open.length, stopped });
}
