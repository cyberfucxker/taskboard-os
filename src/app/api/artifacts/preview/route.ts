import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseGoogleDriveUrl } from "@/lib/artifacts/verifier";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ ok: false, error: "URL is required" }, { status: 400 });
    }

    const driveInfo = parseGoogleDriveUrl(url);
    if (!driveInfo.isDrive || !driveInfo.fileId) {
      return NextResponse.json({
        ok: false,
        error: "Not a valid Google Drive URL",
        data: { isDrive: false },
      });
    }

    const fileId = driveInfo.fileId;
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
    const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    const directViewUrl = `https://drive.google.com/uc?id=${fileId}&export=view`;

    return NextResponse.json({
      ok: true,
      data: {
        isDrive: true,
        fileId,
        resourceType: driveInfo.resourceType,
        thumbnailUrl,
        embedUrl,
        directViewUrl,
        cachedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to generate preview" },
      { status: 500 }
    );
  }
}
