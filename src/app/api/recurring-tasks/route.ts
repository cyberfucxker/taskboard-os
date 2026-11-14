import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const VALID_DAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

const SLUG_TO_DEPARTMENT_NAME: Record<string, string> = {
  leadership: "LEADERSHIP",
  sales: "SALES",
  design: "DESIGN",
  dev: "DEVELOPMENT",
  dm: "DIGITAL_MARKETING",
  hr: "HR",
  finance: "FINANCE",
};

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const departmentId = searchParams.get("departmentId");

    const where: any = {};
    const role = session.user.role;

    if (role === "SUPER_ADMIN") {
      if (departmentId) where.departmentId = departmentId;
      if (employeeId) where.assigneeId = employeeId;
    } else if (role === "DEPARTMENT_HEAD") {
      const deptName = SLUG_TO_DEPARTMENT_NAME[session.user.departmentSlug ?? ""] ?? "__none__";
      where.OR = [
        { departmentName: deptName },
        { assigneeId: session.user.id },
      ];
      if (employeeId) where.assigneeId = employeeId;
    } else {
      // Standard employees can view routines assigned to them or unassigned/general routines
      where.OR = [
        { assigneeId: session.user.id },
        { assigneeId: null },
      ];
    }

    const templates = await (prisma as any).recurringTaskTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const assigneeIds = Array.from(new Set(templates.map((t: any) => t.assigneeId).filter(Boolean))) as string[];
    const assignees = assigneeIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const assigneeMap = new Map(assignees.map((e) => [e.id, e]));

    const enriched = templates.map((t: any) => ({
      ...t,
      assignee: assigneeMap.get(t.assigneeId) || null,
      canEdit:
        role === "SUPER_ADMIN" ||
        (role === "DEPARTMENT_HEAD" && t.departmentName === SLUG_TO_DEPARTMENT_NAME[session.user.departmentSlug ?? ""]) ||
        t.assigneeId === session.user.id,
    }));

    return NextResponse.json({ ok: true, data: enriched });
  } catch (err: any) {
    console.error("GET /api/recurring-tasks error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to fetch recurring templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description,
      frequency = "DAILY",
      scheduledDays = ["MON", "TUE", "WED", "THU", "FRI"],
      scheduledTime = "09:30",
      departmentId,
      departmentName,
      role,
      priority = "P2",
      assigneeId,
      isActive = true,
      subtasks = [],
    } = body;

    if (!title || !String(title).trim()) {
      return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
    }
    if (!VALID_PRIORITIES.has(priority)) {
      return NextResponse.json({ ok: false, error: `priority must be one of ${[...VALID_PRIORITIES].join(", ")}` }, { status: 400 });
    }
    if (!Array.isArray(scheduledDays) || scheduledDays.some((d: string) => !VALID_DAYS.has(d))) {
      return NextResponse.json({ ok: false, error: `scheduledDays must only contain ${[...VALID_DAYS].join(", ")}` }, { status: 400 });
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isDeptHead = session.user.role === "DEPARTMENT_HEAD";

    let effectiveAssigneeId = assigneeId || null;
    let effectiveDepartmentId = departmentId || null;
    let effectiveDepartmentName = departmentName || null;

    if (!isSuperAdmin && !isDeptHead) {
      // Standard employees can create routines assigned to themselves
      effectiveAssigneeId = session.user.id;
    } else if (isDeptHead) {
      effectiveDepartmentId = null;
      effectiveDepartmentName = SLUG_TO_DEPARTMENT_NAME[session.user.departmentSlug ?? ""] ?? null;
    }

    const template = await (prisma as any).recurringTaskTemplate.create({
      data: {
        title: String(title).trim(),
        description: description?.trim() || null,
        frequency,
        scheduledDays,
        scheduledTime,
        departmentId: effectiveDepartmentId,
        departmentName: effectiveDepartmentName,
        role: role || null,
        priority,
        assigneeId: effectiveAssigneeId,
        isActive: Boolean(isActive),
        subtasks: Array.isArray(subtasks) ? subtasks : [],
      },
    });

    return NextResponse.json({ ok: true, message: "Recurring task template created", data: template });
  } catch (err: any) {
    const status = (err as { status?: number }).status ?? 400;
    console.error("POST /api/recurring-tasks error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to create recurring template" }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

    const existing = await (prisma as any).recurringTaskTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isDeptHead = session.user.role === "DEPARTMENT_HEAD";
    const isOwner = existing.assigneeId === session.user.id;

    if (!isSuperAdmin) {
      if (isDeptHead) {
        const myDept = SLUG_TO_DEPARTMENT_NAME[session.user.departmentSlug ?? ""] ?? "__none__";
        if (existing.departmentName !== myDept && !isOwner) {
          return NextResponse.json({ ok: false, error: "You can only manage your own department's or personal templates" }, { status: 403 });
        }
      } else if (!isOwner) {
        return NextResponse.json({ ok: false, error: "You can only modify your own routine templates" }, { status: 403 });
      }
    }

    if (rest.priority && !VALID_PRIORITIES.has(rest.priority)) {
      return NextResponse.json({ ok: false, error: `priority must be one of ${[...VALID_PRIORITIES].join(", ")}` }, { status: 400 });
    }
    if (rest.scheduledDays && (!Array.isArray(rest.scheduledDays) || rest.scheduledDays.some((d: string) => !VALID_DAYS.has(d)))) {
      return NextResponse.json({ ok: false, error: `scheduledDays must only contain ${[...VALID_DAYS].join(", ")}` }, { status: 400 });
    }

    const allowed = ["title", "description", "frequency", "scheduledDays", "scheduledTime", "departmentId", "departmentName", "role", "priority", "assigneeId", "isActive", "subtasks"];

    if (!isSuperAdmin) {
      delete (rest as Record<string, unknown>).departmentId;
      delete (rest as Record<string, unknown>).departmentName;
      if (!isDeptHead) {
        delete (rest as Record<string, unknown>).assigneeId;
      }
    }

    const data: Record<string, unknown> = {};
    for (const key of allowed) if (key in rest) data[key] = rest[key];

    const template = await (prisma as any).recurringTaskTemplate.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: template });
  } catch (err: any) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: err.message || "Failed to update recurring template" }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

    const existing = await (prisma as any).recurringTaskTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isDeptHead = session.user.role === "DEPARTMENT_HEAD";
    const isOwner = existing.assigneeId === session.user.id;

    if (!isSuperAdmin) {
      if (isDeptHead) {
        const myDept = SLUG_TO_DEPARTMENT_NAME[session.user.departmentSlug ?? ""] ?? "__none__";
        if (existing.departmentName !== myDept && !isOwner) {
          return NextResponse.json({ ok: false, error: "You can only manage your own department's or personal templates" }, { status: 403 });
        }
      } else if (!isOwner) {
        return NextResponse.json({ ok: false, error: "You can only delete your own routine templates" }, { status: 403 });
      }
    }

    await (prisma as any).recurringTaskTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: err.message || "Failed to delete recurring template" }, { status });
  }
}
