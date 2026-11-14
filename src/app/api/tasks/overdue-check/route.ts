import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/overdue-check — flags overdue open tasks once (idempotent).
 * Escalates P2/P3 -> P0 and adds ONE system comment per task (only when not
 * already escalated). Run daily via cron. Cron-only (see lib/cron-auth.ts) —
 * without this, anyone who could POST the URL could trigger org-wide P0
 * escalation and comment-spam every overdue task on demand.
 */
export async function POST(req: Request) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const now = new Date();
  const overdue = await prisma.task.findMany({
    where: { dueDate: { lt: now }, status: { notIn: ["DONE"] }, deletedAt: null },
    select: { id: true, code: true, title: true, priority: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });

  const updated = [];
  for (const t of overdue) {
    const data: any = {};
    const escalated = t.priority === "P2" || t.priority === "P3";
    if (escalated) data.priority = "P0";

    // Only add a comment on first escalation (P0 anywhere means already seen).
    if (escalated) {
      const daysOver = Math.ceil((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000);
      await prisma.taskComment.create({
        data: {
          taskId: t.id,
          authorId: null,
          body: `⚠ OVERDUE by ${daysOver} day(s). Escalated to P0. Assignee must update status or reschedule.`,
        },
      });
      await prisma.task.update({ where: { id: t.id }, data });
      updated.push({ code: t.code, daysOver, escalated: true });
    } else {
      // Already escalated (P0). Just count it as still-overdue without re-commenting.
      const daysOver = Math.ceil((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000);
      updated.push({ code: t.code, daysOver, escalated: false });
    }
  }

  return NextResponse.json({
    ok: true,
    flagged: updated.filter((u) => u.escalated).length,
    totalOverdue: updated.length,
    tasks: updated.slice(0, 50),
  });
}