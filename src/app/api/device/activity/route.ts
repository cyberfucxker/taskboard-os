import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/device/activity (agent)
 * Auth: header `x-agent-secret` + `x-agent-device`.
 * Bulk-creates DeviceActivity rows and updates device.lastSeenAt.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-agent-secret");
  const deviceId = req.headers.get("x-agent-device");
  if (!secret || secret !== process.env.AGENT_SECRET || !deviceId) {
    return NextResponse.json({ ok: false, error: "Invalid agent credentials" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const activities = body.activities;
  if (!Array.isArray(activities) || activities.length === 0) {
    return NextResponse.json({ ok: false, error: "activities[] required" }, { status: 400 });
  }

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.deletedAt) {
    return NextResponse.json({ ok: false, error: "Device not found" }, { status: 404 });
  }

  const rows = activities.slice(0, 200).map((a: any) => ({
    deviceId,
    timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
    activeApp: a.activeApp ?? null,
    activeWindow: a.activeWindow ?? null,
    category: a.category ?? "UNKNOWN",
    keystrokes: a.keystrokes ?? 0,
    mouseClicks: a.mouseClicks ?? 0,
    url: a.url ?? null,
    cpuUsage: a.cpuUsage ?? null,
    memUsage: a.memUsage ?? null,
  }));

  const saved = await prisma.deviceActivity.createMany({ data: rows });
  await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });

  return NextResponse.json({ ok: true, saved: saved.count });
}