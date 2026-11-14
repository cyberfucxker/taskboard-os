import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyDeliverableUrl } from "@/lib/artifacts/verifier";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { url, artifactId, taskId } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid URL parameter" }, { status: 400 });
    }

    const targetUrl = url.trim();
    const result = await verifyDeliverableUrl(targetUrl);

    if (artifactId) {
      const artifact = await (prisma as any).artifact.findUnique({
        where: { id: artifactId },
      });

      if (artifact) {
        await (prisma as any).artifact.update({
          where: { id: artifactId },
          data: {
            verificationStatus: result.status,
            verifiedAt: new Date(),
            metadata: result as any,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to verify deliverable URL" },
      { status: 500 }
    );
  }
}
