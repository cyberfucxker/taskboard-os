import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Employee update/delete (HRMS) — RBAC-gated (hrms.manage).
 *
 *   PATCH  /api/employees/[id]  → partial update of an employee's directory
 *          fields, preserving omitted values. A caller may NOT change their
 *          OWN role (prevents self-demotion / self-elevation).
 *   DELETE /api/employees/[id]  → soft delete (sets deletedAt), never a hard wipe.
 */

const ROLE_VALUES = [
  "SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "SENIOR_EXECUTIVE",
  "EXECUTIVE", "INTERN", "ACCOUNT_MANAGER", "HR", "FINANCE",
  "CLIENT_ADMIN", "CLIENT_VIEWER", "EXTERNAL_CONTRACTOR",
] as const;

const STATUS_VALUES = ["ACTIVE", "OVERLOADED", "ON_LEAVE", "PROBATION", "EXITED"] as const;

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  role: z.enum(ROLE_VALUES).optional(),
  departmentId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  status: z.enum(STATUS_VALUES).optional(),
  weeklyCapacityHrs: z.number().min(0).nullable().optional(),
  avatarInitials: z.string().nullable().optional(),
  // —— HR profile (HRMS) ——
  dob: z.string().nullable().optional(), // ISO date
  personalPhone: z.string().nullable().optional(),
  personalEmail: z.string().nullable().optional(),
  workEmail: z.string().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  annualCtc: z.number().nullable().optional(),
  exitReason: z.string().nullable().optional(),
  exitedAt: z.string().nullable().optional(), // ISO date
  devices: z.array(z.any()).optional(),
  performanceReviews: z.array(z.any()).optional(),
  toolAccess: z.array(z.any()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole("hrms.manage");
    const body = patchSchema.parse(await req.json());

    // A user editing their own record must not be able to change their role.
    if (body.role !== undefined && params.id === session.user.id) {
      return NextResponse.json(
        { ok: false, error: "You cannot change your own role" },
        { status: 400 }
      );
    }

    // Only write the fields actually present in the request.
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.title !== undefined) data.title = body.title;
    if (body.role !== undefined) data.role = body.role;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId;
    if (body.managerId !== undefined) data.managerId = body.managerId;
    if (body.status !== undefined) data.status = body.status;
    if (body.weeklyCapacityHrs !== undefined) data.weeklyCapacityHrs = body.weeklyCapacityHrs;
    if (body.avatarInitials !== undefined) data.avatarInitials = body.avatarInitials;
    if (body.dob !== undefined) data.dob = body.dob === null ? null : new Date(body.dob);
    if (body.personalPhone !== undefined) data.personalPhone = body.personalPhone;
    if (body.personalEmail !== undefined) data.personalEmail = body.personalEmail;
    if (body.workEmail !== undefined) data.workEmail = body.workEmail;
    if (body.emergencyContactName !== undefined) data.emergencyContactName = body.emergencyContactName;
    if (body.emergencyContactPhone !== undefined) data.emergencyContactPhone = body.emergencyContactPhone;
    if (body.annualCtc !== undefined) data.annualCtc = body.annualCtc === null ? null : new Prisma.Decimal(body.annualCtc);
    if (body.exitReason !== undefined) data.exitReason = body.exitReason;
    if (body.exitedAt !== undefined) data.exitedAt = body.exitedAt === null ? null : new Date(body.exitedAt);
    if (body.devices !== undefined) data.devices = body.devices;
    if (body.performanceReviews !== undefined) data.performanceReviews = body.performanceReviews;
    if (body.toolAccess !== undefined) data.toolAccess = body.toolAccess;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No updatable fields supplied" },
        { status: 400 }
      );
    }

    await prisma.employee.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole("hrms.manage");
    // SOFT delete only — the record stays in the directory, flagged deletedAt.
    await prisma.employee.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}