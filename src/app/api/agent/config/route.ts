import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/**
 * GET  /api/agent/config?employeeId=xxx — fetch agent config
 * POST /api/agent/config                — create or upsert agent config
 *
 * Auth rules:
 *   - Any authenticated employee can read/write their own config
 *   - SUPER_ADMIN / TEAM_LEAD / EXECUTIVE (leadership) can read/write any employee's config
 */

const LEADERSHIP_ROLES = ["SUPER_ADMIN", "TEAM_LEAD", "EXECUTIVE"];

const upsertSchema = z.object({
  employeeId: z.string().min(1),
  isActive: z.boolean().optional(),
  roleBrief: z.string().optional(),
  skills: z.array(z.any()).optional(),
  handoffRules: z.record(z.any()).optional(),
  allowedTools: z.array(z.any()).optional(),
  model: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") || session.user.id;

    // Auth check: own record or leadership
    if (
      employeeId !== session.user.id &&
      !LEADERSHIP_ROLES.includes(session.user.role)
    ) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: cannot read another employee's agent config" },
        { status: 403 }
      );
    }

    const config = await prisma.agentConfig.findUnique({
      where: { employeeId },
      include: {
        employee: {
          select: { id: true, name: true, role: true, title: true },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { ok: false, error: "AgentConfig not found for this employee" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, config });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const body = upsertSchema.parse(await req.json());

    // Auth check: own record or leadership
    if (
      body.employeeId !== session.user.id &&
      !LEADERSHIP_ROLES.includes(session.user.role)
    ) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: cannot modify another employee's agent config" },
        { status: 403 }
      );
    }

    // Verify employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json(
        { ok: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const data: any = {};
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.roleBrief !== undefined) data.roleBrief = body.roleBrief;
    if (body.skills !== undefined) data.skills = body.skills;
    if (body.handoffRules !== undefined) data.handoffRules = body.handoffRules;
    if (body.allowedTools !== undefined) data.allowedTools = body.allowedTools;
    if (body.model !== undefined) data.model = body.model;

    const config = await prisma.agentConfig.upsert({
      where: { employeeId: body.employeeId },
      create: {
        employeeId: body.employeeId,
        ...data,
      },
      update: data,
      include: {
        employee: {
          select: { id: true, name: true, role: true, title: true },
        },
      },
    });

    return NextResponse.json({ ok: true, config });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

// PATCH is an alias for POST (same upsert logic)
export { POST as PATCH };

export const dynamic = "force-dynamic";
