import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Shared agent authentication.
 *
 * The desktop agent authenticates by presenting:
 *   header `x-agent-secret`   — the shared server secret (matches env AGENT_SECRET)
 *   header `x-agent-device`   — the device id registered for this employee
 *
 * This is a machine-to-machine credential (not a browser session), so the
 * standard session-based requireRole() cannot apply. Ownership is enforced by
 * resolving the device's employee and returning their id; route handlers then
 * scope queries to that employee where applicable.
 */
export async function requireAgent(req: NextRequest): Promise<{ employeeId: string; deviceId: string } | null> {
  const secret = req.headers.get("x-agent-secret");
  const deviceId = req.headers.get("x-agent-device");
  if (!secret || !deviceId) return null;

  const expected = process.env.AGENT_SECRET;
  if (!expected || secret !== expected) return null;

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.deletedAt) return null;

  return { employeeId: device.employeeId, deviceId: device.id };
}

/** Returns a 401 NextResponse when agent credentials are invalid. */
export function agentDenied(): NextResponse {
  return NextResponse.json({ ok: false, error: "Invalid agent credentials" }, { status: 401 });
}