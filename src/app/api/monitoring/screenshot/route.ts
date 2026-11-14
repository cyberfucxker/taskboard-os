import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/monitoring/screenshot — leadership requests a screenshot.
 *   Body: { deviceId }
 *   Creates a DeviceCommand(type='SCREENSHOT').
 * GET /api/monitoring/screenshot?deviceId=... — list screenshots.
 */
const schema = z.object({
  deviceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("hrms.manage");
    const body = schema.parse(await req.json());

    const device = await prisma.device.findFirst({
      where: { id: body.deviceId, deletedAt: null },
    });
    if (!device) {
      return NextResponse.json({ ok: false, error: "Device not found" }, { status: 404 });
    }

    const command = await prisma.deviceCommand.create({
      data: {
        deviceId: body.deviceId,
        type: "SCREENSHOT",
        issuedById: session.user.id ?? null,
      },
    });

    return NextResponse.json({ ok: true, commandId: command.id });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole("hrms.manage");

    const deviceId = req.nextUrl.searchParams.get("deviceId");
    const where = deviceId ? { deviceId } : {};

    const screenshots = await prisma.screenshot.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        commandId: true,
        deviceId: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        storageUrl: true,
        createdAt: true,
        device: {
          select: {
            hostname: true,
            employee: { select: { name: true } },
          },
        },
      },
    });

    const list = screenshots.map((s) => ({
      id: s.id,
      commandId: s.commandId,
      deviceId: s.deviceId,
      hostname: s.device?.hostname ?? null,
      employeeName: s.device?.employee?.name ?? null,
      filename: s.filename,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      storageUrl: s.storageUrl,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({ screenshots: list });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}