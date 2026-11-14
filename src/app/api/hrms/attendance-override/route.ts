import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["PRESENT", "HALF_DAY", "ON_LEAVE", "ABSENT"]);

const schema = z.object({
  employeeId: z.string().min(1),
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["PRESENT", "HALF_DAY", "ON_LEAVE", "ABSENT"]),
  hoursWorked: z.number().min(0).max(24).optional(),
  otHours: z.number().min(0).max(24).optional(),
});

/**
 * POST /api/hrms/attendance-override
 *
 * Manual attendance correction for one employee on one day. Previously the
 * HRMS Attendance tab's Present/Half-Day/On-Leave/Absent buttons only updated
 * local React state — the change looked like it worked but was lost on
 * refresh. This persists it for real, and `src/app/(app)/hrms/page.tsx`
 * applies it on top of the computed-from-work-sessions attendance for today.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("hrms.manage");
    const body = schema.parse(await req.json());

    const defaultHours = body.status === "ON_LEAVE" || body.status === "ABSENT" ? 0 : body.status === "HALF_DAY" ? 4 : 8;

    const override = await prisma.attendanceOverride.upsert({
      where: { employeeId_dateStr: { employeeId: body.employeeId, dateStr: body.dateStr } },
      create: {
        employeeId: body.employeeId,
        dateStr: body.dateStr,
        status: body.status,
        hoursWorked: body.hoursWorked ?? defaultHours,
        otHours: body.otHours ?? 0,
        setById: session.user.id,
      },
      update: {
        status: body.status,
        hoursWorked: body.hoursWorked ?? defaultHours,
        otHours: body.otHours ?? 0,
      },
    });

    return NextResponse.json({ ok: true, data: override });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
