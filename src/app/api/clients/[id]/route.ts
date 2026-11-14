import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emitEvent } from "@/lib/eventlog";
import { getClientById } from "@/lib/data/clients";

export const dynamic = "force-dynamic";

const editSchema = z.object({
  action: z.literal("edit"),
  name: z.string().min(1).optional(),
  industry: z.string().nullish().optional(),
  tier: z.string().nullish().optional(),
  health: z.enum(["HEALTHY", "WATCH", "AT_RISK"]).optional(),
  description: z.string().nullish().optional(),
});

/**
 * GET /api/clients/[id] — full client detail (dept-scoped). Used by the peek
 * drawer and the client detail page. 404 when the client is out of the viewer's
 * scope.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.view");
    const client = await getClientById(session, params.id);
    if (!client) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    return NextResponse.json({ ok: true, client });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/**
 * PATCH /api/clients/[id] — edit a client. Gated on account management
 * (crm.manage). Every change is audited to the Activity log.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("crm.manage");
    const body = await req.json();
    const patch = editSchema.parse(body);

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

    const changes: Record<string, unknown> = {};
    if (patch.name !== undefined && patch.name !== client.name) changes.name = patch.name.trim();
    if (patch.industry !== undefined && patch.industry !== client.industry) changes.industry = patch.industry ?? null;
    if (patch.tier !== undefined && patch.tier !== client.tier) changes.tier = patch.tier ?? null;
    if (patch.health !== undefined && patch.health !== client.health) changes.health = patch.health;
    if (patch.description !== undefined && patch.description !== client.description) changes.description = patch.description ?? null;

    if (Object.keys(changes).length === 0) return NextResponse.json({ ok: true });

    await prisma.client.update({ where: { id: params.id }, data: changes });
    await emitEvent({
      type: "CLIENT_UPDATED",
      actorId: session.user.id,
      entityType: "client",
      entityId: params.id,
      payload: { v: 1, name: client.name, fields: Object.keys(changes) },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/**
 * DELETE /api/clients/[id] — soft-delete a client and cascade soft-delete its
 * contacts and contracts; owner join rows carry no deletedAt, so they are
 * removed outright. Tasks and projects attached to the client are left intact.
 * Gated on account management (crm.manage). Audited to the Activity log.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("crm.manage");

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.contact.updateMany({ where: { clientId: params.id }, data: { deletedAt: now } }),
      prisma.contract.updateMany({ where: { clientId: params.id }, data: { deletedAt: now } }),
      prisma.clientOwner.deleteMany({ where: { clientId: params.id } }),
      prisma.client.update({ where: { id: params.id }, data: { deletedAt: now } }),
    ]);

    await emitEvent({
      type: "CLIENT_UPDATED",
      actorId: session.user.id,
      entityType: "client",
      entityId: params.id,
      clientId: params.id,
      payload: { v: 1, name: client.name, deleted: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}