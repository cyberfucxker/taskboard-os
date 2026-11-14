import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * POST /api/standup/check — employees who haven't done standup today.
 * Matches submitStandup's storage: server-local start-of-day.
 * Cron-only (see lib/cron-auth.ts) — this has no session to check because
 * root's crontab calls it directly, but it must not be reachable by anyone
 * who can just POST the URL.
 */
export async function POST(req: Request) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const today = istDayStart(new Date());

  const doneStandup = await prisma.dailyUpdate.findMany({
    where: { date: today },
    select: { employeeId: true },
  });
  const doneIds = new Set(doneStandup.map((s) => s.employeeId));

  const active = await prisma.employee.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, department: { select: { name: true } } },
  });

  const missing = active.filter((e) => !doneIds.has(e.id));

  return NextResponse.json({
    ok: true,
    total: active.length,
    done: doneIds.size,
    missing: missing.map((e) => ({
      id: e.id,
      name: e.name,
      department: e.department?.name ?? "Unassigned",
    })),
    participation: active.length > 0 ? Math.round((doneIds.size / active.length) * 100) : 0,
  });
}