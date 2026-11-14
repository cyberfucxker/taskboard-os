import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read — mark notification(s) as read. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = body.ids ?? [];

  if (ids.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: ids }, employeeId: session.user.id },
      data: { read: true },
    });
  } else {
    // mark all as read
    await prisma.notification.updateMany({
      where: { employeeId: session.user.id, read: false },
      data: { read: true },
    });
  }
  return NextResponse.json({ ok: true });
}
