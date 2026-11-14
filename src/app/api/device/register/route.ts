import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/device/register (agent)
 * Upserts a Device for the employee → returns deviceId.
 * The agent then presents that deviceId + the shared agent secret on all
 * subsequent requests (activity upload, command polling).
 *
 * First-time registration is guarded by the agent secret in the header,
 * exactly like the other agent endpoints.
 */
const schema = z.object({
  employeeEmail: z.string().email(),
  hostname: z.string().nullish(),
  os: z.string().nullish(),
  agentVersion: z.string().nullish(),
});

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-agent-secret");
  if (!secret || secret !== process.env.AGENT_SECRET) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Invalid body: " + body.error.message }, { status: 400 });
  }
  const { employeeEmail, hostname, os, agentVersion } = body.data;
  const now = new Date();

  const employee = await prisma.employee.findUnique({ where: { email: employeeEmail } });
  if (!employee || employee.deletedAt) {
    return NextResponse.json({ ok: false, error: "Unknown employee" }, { status: 404 });
  }

  let device = await prisma.device.findFirst({
    where: { employeeId: employee.id, hostname: hostname ?? null, deletedAt: null },
  });

  if (device) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: { os: os ?? null, agentVersion: agentVersion ?? null, lastSeenAt: now },
    });
  } else {
    device = await prisma.device.create({
      data: {
        employeeId: employee.id, hostname: hostname ?? null, os: os ?? null,
        agentVersion: agentVersion ?? null, lastSeenAt: now,
      },
    });
  }

  return NextResponse.json({ ok: true, deviceId: device.id, employeeName: employee.name });
}