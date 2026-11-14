import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushToEmployee } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * POST /api/lms/announce — "The Signal is live" fan-out to every employee.
 * Gated on `lms.manage` (COO; others only via an /access override), same as
 * api/lms/team. Inserts one Notification per active *internal* employee and
 * fires a web-push to each (prunes dead subs inside sendPushToEmployee).
 *
 * NOTE: the live Notification model has NO entityType/entityId/url columns,
 * so the in-app createMany carries only employeeId/title/detail/severity/kind;
 * the deep-link lives in the web-push payload (url), not the DB row.
 *
 * Body: { courseId: string, title?, url? } — resolves to a published Course so
 * the deep-link is real. Returns the fan-out counts.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("lms.manage");
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const courseId = typeof body.courseId === "string" ? body.courseId : null;
    if (!courseId) {
      return NextResponse.json({ error: "courseId is required" }, { status: 400 });
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    });
    if (!course || course.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Course not found or not published" }, { status: 404 });
    }

    const title = typeof body.title === "string" && body.title.trim() ? body.title : "The Acme Signal is live";
    const courseUrl =
      typeof body.url === "string" && body.url.trim() ? body.url.trim() : `/lms/${course.id}`;

    const employees = await prisma.employee.findMany({
      where: { portalClientId: null, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });

    let notified = 0;
    if (employees.length > 0) {
      const created = await prisma.notification.createMany({
        data: employees.map((e) => ({
          employeeId: e.id,
          title,
          detail: `New company module on /lms — ${course.title}. Everyone reads this.`,
          severity: "Info",
          kind: "announcement",
        })),
      });
      notified = created.count;
    }

    // Web-push best-effort (pushConfigured gate + per-sub; sendPushToEmployee
    // tolerates no subscriptions / invalid tokens).
    for (const e of employees) {
      try {
        await sendPushToEmployee(e.id, {
          title,
          body: `New company module on /lms — ${course.title}.`,
          url: courseUrl,
        });
      } catch {
        /* never let one bad push fail the fan-out */
      }
    }

    return NextResponse.json({ ok: true, notified, total: employees.length });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}