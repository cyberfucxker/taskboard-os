import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 * Saves (or refreshes) an employee's push subscription for this browser.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const endpoint: string = body?.endpoint;
  const p256dh: string = body?.keys?.p256dh;
  const auth: string = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
  }

  // Upsert by endpoint so the same device is never duplicated.
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (existing) {
    await prisma.pushSubscription.update({
      where: { endpoint },
      data: { employeeId: session.user.id, p256dh, auth, userAgent: body.userAgent ?? existing.userAgent },
    });
  } else {
    await prisma.pushSubscription.create({
      data: {
        employeeId: session.user.id,
        endpoint,
        p256dh,
        auth,
        userAgent: body.userAgent ?? null,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
