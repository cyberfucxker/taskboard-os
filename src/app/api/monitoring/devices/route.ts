import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitoring/devices — leadership lists devices.
 * Returns devices with employee name, lastSeenAt, and today's activity count.
 */
export async function GET(_req: NextRequest) {
  try {
    await requireRole("hrms.manage");

    const startOfToday = istDayStart(new Date());

    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        employeeId: true,
        hostname: true,
        os: true,
        agentVersion: true,
        lastSeenAt: true,
        employee: { select: { id: true, name: true } },
        activities: {
          where: { timestamp: { gte: startOfToday } },
          select: { id: true },
        },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    const list = devices.map((d) => ({
      id: d.id,
      employeeId: d.employeeId,
      employeeName: d.employee?.name ?? null,
      hostname: d.hostname,
      os: d.os,
      agentVersion: d.agentVersion,
      lastSeenAt: d.lastSeenAt,
      activityToday: d.activities.length,
    }));

    return NextResponse.json({ devices: list });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}