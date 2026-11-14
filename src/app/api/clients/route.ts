import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emitEvent } from "@/lib/eventlog";

export const dynamic = "force-dynamic";

const CREATE_HEALTH = ["HEALTHY", "WATCH", "AT_RISK"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  orgId: z.string().optional(),
  industry: z.string().nullish().optional(),
  region: z.string().nullish().optional(),
  tier: z.string().nullish().optional(),
  health: z.enum(CREATE_HEALTH).default("HEALTHY"),
  description: z.string().nullish().optional(),
  ownerIds: z.array(z.string().min(1)).optional(),
});

/**
 * POST /api/clients — create a client (plus optional owner links). Gated on
 * account management (crm.manage). The client is assigned to the workspace's
 * org (or an explicit orgId); owners are linked through new ClientOwner rows.
 * Audited to the Activity log.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("crm.manage");
    const body = createSchema.parse(await req.json());

    // Resolve the tenant org: an explicit orgId wins, otherwise the workspace org.
    let orgId = body.orgId;
    if (!orgId) {
      const org = await prisma.org.findFirst();
      if (!org) {
        return NextResponse.json(
          { ok: false, error: "No organization configured" },
          { status: 500 }
        );
      }
      orgId = org.id;
    }

    const health = body.health;

    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          orgId,
          name: body.name.trim(),
          industry: body.industry ?? null,
          region: body.region ?? null,
          tier: body.tier ?? null,
          health,
          description: body.description ?? null,
        },
        select: {
          id: true,
          name: true,
          industry: true,
          region: true,
          tier: true,
          health: true,
          description: true,
          orgId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (body.ownerIds && body.ownerIds.length > 0) {
        await tx.clientOwner.createMany({
          data: Array.from(new Set(body.ownerIds)).map((ownerId) => ({
            clientId: created.id,
            ownerId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    await emitEvent({
      type: "CLIENT_CREATED",
      actorId: session.user.id,
      entityType: "client",
      entityId: client.id,
      clientId: client.id,
      payload: { v: 1, name: client.name, orgId },
    });

    return NextResponse.json({ ok: true, client });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}