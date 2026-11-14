import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");

    const where: any = {};
    if (taskId) where.taskId = taskId;

    const blockers = await (prisma as any).blocker.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, data: blockers });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { taskId, reason } = body;

    if (!taskId || !reason) {
      return NextResponse.json({ ok: false, error: "taskId and reason are required" }, { status: 400 });
    }

    const blocker = await (prisma as any).blocker.create({
      data: {
        taskId,
        createdById: session.user.id,
        reason,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ ok: true, data: blocker });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
