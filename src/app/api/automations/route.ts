import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, getOrgId } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const triggerSchema = z.object({
  type: z.enum(["task_created", "lead_stage_changed", "project_created", "schedule", "manual", "webhook"]),
  config: z.record(z.any()).default({}),
});

const conditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "ne", "gt", "lt", "contains", "not_contains"]),
  value: z.any(),
});

const actionSchema = z.object({
  type: z.enum(["send_whatsapp", "create_task", "assign_task", "send_email", "call_ai", "update_field", "webhook"]),
  config: z.record(z.any()).default({}),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().default(""),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
  scope: z.enum(["personal", "department", "global"]).default("personal"),
  roleRestrict: z.array(z.string()).default([]),
});

/**
 * GET /api/automations — list automations visible to current user.
 * - personal scope: own only
 * - department scope: dept head + above
 * - global scope: admin only
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const { searchParams } = new URL(req.url);
    const scopeFilter = searchParams.get("scope") || undefined;

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    // A department-scoped automation is only visible within its OWN
    // department — a Dev department head must not see Sales' automations.
    const isDeptLead = ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(session.user.role);

    const OR: any[] = [
      { createdById: session.user.id },
    ];

    if (isDeptLead && session.user.departmentId) {
      OR.push({ scope: "department", departmentId: session.user.departmentId });
    }
    if (isSuperAdmin) {
      OR.push({ scope: "global", orgId: await getOrgId() });
      OR.push({ scope: "department" }); // admin sees every department's automations
    }

    const orgId = await getOrgId();
    const where: any = { orgId, OR };
    if (scopeFilter) where.scope = scopeFilter;

    const automations = await prisma.automation.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, avatarInitials: true } },
        runs: { take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, automations });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/**
 * POST /api/automations — create a new automation.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const body = createSchema.parse(await req.json());

    if (body.scope === "global" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "Only admins can create global automations" }, { status: 403 });
    }
    if (body.scope === "department" && !["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"].includes(session.user.role)) {
      return NextResponse.json({ ok: false, error: "Only department heads can create department automations" }, { status: 403 });
    }
    if (body.scope === "department" && !session.user.departmentId && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "No department on file for your account" }, { status: 400 });
    }

    const automation = await prisma.automation.create({
      data: {
        orgId: await getOrgId(),
        createdById: session.user.id,
        name: body.name,
        description: body.description,
        trigger: body.trigger as any,
        conditions: body.conditions as any,
        actions: body.actions as any,
        scope: body.scope,
        departmentId: body.scope === "department" ? session.user.departmentId ?? null : null,
        roleRestrict: body.roleRestrict,
        isActive: true,
      },
    });

    return NextResponse.json({ ok: true, automation });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/**
 * PATCH /api/automations — toggle isActive / rename (id in body).
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const body = await req.json();
    const { id, isActive, name, description } = body;

    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const existing = await prisma.automation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (existing.createdById !== session.user.id && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.automation.update({
      where: { id },
      data: {
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });

    return NextResponse.json({ ok: true, automation: updated });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/**
 * DELETE /api/automations?id=xxx
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const existing = await prisma.automation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (existing.createdById !== session.user.id && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await prisma.automationRun.deleteMany({ where: { automationId: id } });
    await prisma.automation.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
