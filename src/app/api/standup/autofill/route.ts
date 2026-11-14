import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const today = istDayStart(new Date());

    const [todaySessions, inProgressTasks, blockedTasks, doneTasks] = await Promise.all([
      prisma.taskWorkSession.findMany({
        where: {
          assigneeId: userId,
          startedAt: { gte: today },
        },
        include: { task: { select: { code: true, title: true } } },
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          assigneeId: userId,
          status: "IN_PROGRESS",
        },
        select: { code: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          assigneeId: userId,
          blocked: true,
        },
        select: { code: true, title: true, blockerReason: true },
        orderBy: { updatedAt: "desc" },
        take: 3,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          assigneeId: userId,
          status: "DONE",
          updatedAt: { gte: today },
        },
        select: { code: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    // Format auto-fill strings
    const didItems = new Set<string>();
    doneTasks.forEach((t) => didItems.add(`Completed ${t.code}: ${t.title}`));
    todaySessions.forEach((s) => {
      if (s.task) didItems.add(`Worked on ${s.task.code}: ${s.task.title}`);
    });

    const doingItems = new Set<string>();
    inProgressTasks.forEach((t) => doingItems.add(`Continuing ${t.code}: ${t.title}`));

    const blockedItems = blockedTasks.map(
      (t) => `Blocked on ${t.code}: ${t.blockerReason || t.title}`
    );

    return NextResponse.json({
      ok: true,
      autofill: {
        did: Array.from(didItems).join("\n") || "Worked on assigned sprint deliverable items.",
        doing: Array.from(doingItems).join("\n") || "Continuing tasks from project queue.",
        blockedOn: blockedItems.join("\n") || "",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate autofill" }, { status: 500 });
  }
}
