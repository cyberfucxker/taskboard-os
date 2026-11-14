import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent");

    const where: any = {};
    if (agent && agent !== "all") {
      where.agent = agent;
    }

    const runs = await prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        agent: true,
        action: true,
        inputs: true,
        output: true,
        confidence: true,
        model: true,
        status: true,
        spentPaise: true,
        approvedBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, runs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch runs" }, { status: 500 });
  }
}
