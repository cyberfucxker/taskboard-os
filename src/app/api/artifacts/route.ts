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
    if (!taskId) {
      return NextResponse.json({ ok: false, error: "taskId required" }, { status: 400 });
    }

    const artifacts = await (prisma as any).artifact.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });

    const userIds = Array.from(new Set(artifacts.map((a: any) => a.createdById).filter(Boolean)));
    const employees = await (prisma as any).employee.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const empMap = new Map(employees.map((e: any) => [e.id, e]));

    const enriched = artifacts.map((a: any) => ({
      ...a,
      createdBy: empMap.get(a.createdById) || null,
    }));

    return NextResponse.json({ ok: true, data: enriched });
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
    const { taskId, artifactType, title, url, previewUrl, tier = 0, metadata } = body;

    if (!taskId || !artifactType || !title) {
      return NextResponse.json({ ok: false, error: "taskId, artifactType, and title are required" }, { status: 400 });
    }

    const artifact = await (prisma as any).artifact.create({
      data: {
        taskId,
        createdById: session.user.id,
        artifactType,
        tier: Number(tier),
        title,
        url: url || null,
        previewUrl: previewUrl || null,
        metadata: metadata || null,
        verificationStatus: "PENDING",
      },
    });

    const emp = await (prisma as any).employee.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ ok: true, data: { ...artifact, createdBy: emp } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
