import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "Today" here must mean the IST business day, not the UTC calendar date —
// toISOString().slice(0,10) reads a day behind for anyone using the app
// between midnight and ~5:30am IST (same class of bug as istDayStart() in
// lib/time.ts, which this mirrors for a plain date-string instead of a Date).
function istDateStr(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") || session.user.id;
    const dateStr = searchParams.get("dateStr") || istDateStr();

    const commitments = await (prisma as any).todayCommitment.findMany({
      where: { employeeId, dateStr },
      orderBy: { slot: "asc" },
    });

    // Populate task details if needed
    const populated = await Promise.all(
      commitments.map(async (c: any) => {
        const task = await prisma.task.findUnique({
          where: { id: c.taskId },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            client: { select: { name: true } },
            project: { select: { name: true } },
          },
        });
        return { ...c, task };
      })
    );

    return NextResponse.json({ ok: true, data: populated });
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
    const { taskId, slot, dateStr = istDateStr() } = body;

    if (!taskId || slot === undefined) {
      return NextResponse.json({ ok: false, error: "taskId and slot (1, 2, or 3) are required" }, { status: 400 });
    }

    const commitment = await (prisma as any).todayCommitment.upsert({
      where: {
        employeeId_dateStr_slot: {
          employeeId: session.user.id,
          dateStr,
          slot: Number(slot),
        },
      },
      update: { taskId, pinnedAt: new Date() },
      create: {
        employeeId: session.user.id,
        taskId,
        slot: Number(slot),
        dateStr,
      },
    });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, status: true, priority: true },
    });

    return NextResponse.json({ ok: true, data: { ...commitment, task } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const slot = searchParams.get("slot");
    const dateStr = searchParams.get("dateStr") || istDateStr();
    if (!slot) {
      return NextResponse.json({ ok: false, error: "slot is required" }, { status: 400 });
    }

    await (prisma as any).todayCommitment.deleteMany({
      where: { employeeId: session.user.id, dateStr, slot: Number(slot) },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
