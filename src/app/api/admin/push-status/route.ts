import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/push-status
 * Returns every employee with their push subscription count and most recent
 * subscription timestamp. Gated to hrms.view (SUPER_ADMIN, EXECUTIVE, HR).
 *
 * Notification.permission is browser-only and cannot be queried server-side,
 * so subscription count is the best server-side proxy:
 *   0 subs = notifications likely off (or never enabled)
 *   1+ subs = notifications enabled on at least one browser
 */
export async function GET() {
  try {
    await requireRole("hrms.view");
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      department: { select: { name: true } },
      role: true,
      pushSubscriptions: {
        select: { id: true, createdAt: true, userAgent: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const result = employees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    department: e.department?.name ?? null,
    role: e.role,
    subscriptionCount: e.pushSubscriptions.length,
    lastSubscribedAt: e.pushSubscriptions[0]?.createdAt ?? null,
    browsers: e.pushSubscriptions.map((s) => {
      // Extract browser name from userAgent (rough heuristic)
      const ua = s.userAgent || "";
      let browser = "Unknown";
      if (ua.includes("Firefox/")) browser = "Firefox";
      else if (ua.includes("Edg/")) browser = "Edge";
      else if (ua.includes("Chrome/")) browser = "Chrome";
      else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";
      return { browser, subscribedAt: s.createdAt };
    }),
  }));

  const enabled = result.filter((e) => e.subscriptionCount > 0).length;
  const disabled = result.filter((e) => e.subscriptionCount === 0).length;

  return NextResponse.json({
    ok: true,
    summary: { total: result.length, enabled, disabled },
    employees: result,
  });
}
