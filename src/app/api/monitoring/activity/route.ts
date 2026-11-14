import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitoring/activity — leadership queries activity logs.
 * Query params: employeeId?, deviceId?, from?, to?
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("hrms.manage");

    const sp = req.nextUrl.searchParams;
    const employeeId = sp.get("employeeId");
    const deviceId = sp.get("deviceId");
    const from = sp.get("from");
    const to = sp.get("to");

    const where: Record<string, unknown> = {};
    if (employeeId) {
      where.device = { employeeId };
    }
    if (deviceId) {
      where.deviceId = deviceId;
    }
    if (from || to) {
      where.timestamp = {};
      if (from) (where.timestamp as Record<string, unknown>).gte = new Date(from);
      if (to) (where.timestamp as Record<string, unknown>).lte = new Date(to);
    }

    const activities = await prisma.deviceActivity.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 500,
      select: {
        id: true,
        deviceId: true,
        timestamp: true,
        activeApp: true,
        activeWindow: true,
        category: true,
        keystrokes: true,
        mouseClicks: true,
        url: true,
        cpuUsage: true,
        memUsage: true,
        device: {
          select: {
            hostname: true,
            employee: { select: { name: true } },
          },
        },
      },
    });

    const list = activities.map((a) => ({
      id: a.id,
      deviceId: a.deviceId,
      hostname: a.device?.hostname ?? null,
      employeeName: a.device?.employee?.name ?? null,
      timestamp: a.timestamp,
      activeApp: a.activeApp,
      activeWindow: a.activeWindow,
      category: a.category,
      keystrokes: a.keystrokes,
      mouseClicks: a.mouseClicks,
      url: a.url,
      cpuUsage: a.cpuUsage,
      memUsage: a.memUsage,
    }));

    return NextResponse.json({ activities: list });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}