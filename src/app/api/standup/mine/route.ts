import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { istDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startOfDay = istDayStart(new Date());

  const mine = await prisma.dailyUpdate.findFirst({
    where: {
      employeeId: session.user.id,
      date: { gte: startOfDay }
    }
  });

  return NextResponse.json({ submittedToday: !!mine, entry: mine });
}
