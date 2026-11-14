import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getProjectById } from "@/lib/data/projects";
import { emitEvent } from "@/lib/eventlog";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.view");
    const project = await getProjectById(session, params.id);
    if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, project });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  category: z.string().nullish(),
  status: z.enum(["ONBOARDING", "ACTIVE", "PAUSED", "COMPLETED", "OFFBOARDED"]).optional(),
  ownerId: z.string().nullish(),
  startDate: z.string().datetime({ offset: true }).nullish(),
  endDate: z.string().datetime({ offset: true }).nullish(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("tasks.manage");
    const body = patchSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description ?? null;
    if (body.category !== undefined) data.category = body.category ?? null;
    if (body.status !== undefined) data.status = body.status;
    if (body.ownerId !== undefined) data.ownerId = body.ownerId ?? null;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });
    const updated = await prisma.project.update({
      where: { id: params.id },
      data,
      include: {
        client: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ ok: true, project: updated });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.manage");
    const existing = await prisma.project.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!existing) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    await prisma.project.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await emitEvent({
      type: "PROJECT_CREATED",
      actorId: session.user.id,
      entityType: "project",
      entityId: existing.id,
      clientId: existing.clientId,
      payload: { v: 1, name: existing.name, clientId: existing.clientId, action: "deleted" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
