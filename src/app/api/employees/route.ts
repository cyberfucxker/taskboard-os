import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Employee directory API (HRMS) — RBAC-gated.
 *
 *   POST /api/employees  → create a staff/portal record (hrms.manage).
 *   GET  /api/employees  → light people list for dropdowns (hrms.view).
 *
 * Passwords are hashed with bcrypt when supplied; otherwise the record is
 * stored with a null hash (SSO / portal-style seat).
 */

const ROLE_VALUES = [
  "SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "SENIOR_EXECUTIVE",
  "EXECUTIVE", "INTERN", "ACCOUNT_MANAGER", "HR", "FINANCE",
  "CLIENT_ADMIN", "CLIENT_VIEWER", "EXTERNAL_CONTRACTOR",
] as const;

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLE_VALUES),
  title: z.string().nullish(),
  departmentId: z.string().nullish(),
  managerId: z.string().nullish(),
  status: z.enum(["ACTIVE", "PROBATION"]).default("ACTIVE"),
  weeklyCapacityHrs: z.number().min(0).nullish(),
  password: z.string().min(1).nullish(),
});

export async function POST(req: Request) {
  try {
    await requireRole("hrms.manage");
    const body = createSchema.parse(await req.json());

    // Emails are normalized to lowercase + trimmed at the boundary (DM-08).
    const email = body.email.trim().toLowerCase();
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "An employee with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : null;

    const employee = await prisma.employee.create({
      data: {
        email,
        name: body.name,
        role: body.role,
        title: body.title ?? null,
        departmentId: body.departmentId ?? null,
        managerId: body.managerId ?? null,
        status: body.status,
        weeklyCapacityHrs: body.weeklyCapacityHrs ?? null,
        passwordHash,
        pageAccess: [
          "Today", "Tasks", "My Work", "Updates", "Directory",
          "Projects", "Workspace", "Overview", "Calendar", "Settings",
          "Time", "LMS", "Lock", "Automations"
        ],
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return NextResponse.json({ ok: true, employee });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function GET() {
  try {
    await requireRole("hrms.view");
    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, status: { not: "EXITED" } },
      select: {
        id: true,
        name: true,
        title: true,
        role: true,
        status: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ ok: true, employees });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}