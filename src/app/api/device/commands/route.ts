import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SECRET = process.env.AGENT_SECRET;

function authed(req: NextRequest): boolean {
  return req.headers.get("x-agent-secret") === SECRET;
}

/**
 * GET /api/device/commands (agent) — poll pending commands.
 * Auth: x-agent-secret + x-agent-device headers.
 */
export async function GET(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ ok: false, error: "Invalid agent credentials" }, { status: 401 });
  }
  const deviceId = req.headers.get("x-agent-device");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "Device id required" }, { status: 400 });
  }
  const commands = await prisma.deviceCommand.findMany({
    where: { deviceId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ commands });
}

/**
 * POST /api/device/commands (agent) — report command result.
 * Auth: x-agent-secret + x-agent-device headers.
 */
export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ ok: false, error: "Invalid agent credentials" }, { status: 401 });
  }
  const deviceId = req.headers.get("x-agent-device");
  const body = await req.json().catch(() => ({}));
  const { commandId, status, result } = body;
  if (!deviceId || !commandId || !status) {
    return NextResponse.json({ ok: false, error: "deviceId + commandId + status required" }, { status: 400 });
  }
  const updated = await prisma.deviceCommand.update({
    where: { id: commandId },
    data: {
      status,
      result: result ?? undefined,
      executedAt: status === "DONE" || status === "FAILED" ? new Date() : undefined,
    },
  });
  return NextResponse.json({ ok: true, command: updated });
}