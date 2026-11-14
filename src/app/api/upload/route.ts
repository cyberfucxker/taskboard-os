import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const data = await req.formData();
    const file = data.get("file") as unknown as File;
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ ok: false, error: "No valid file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: "File size exceeds 10MB limit" }, { status: 413 });
    }

    const mimeType = file.type?.toLowerCase() || "";
    let ext = ALLOWED_MIME_TYPES[mimeType];

    if (!ext) {
      const originalExt = (file.name || "").split(".").pop()?.toLowerCase() || "";
      if (["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"].includes(originalExt)) {
        ext = originalExt === "jpeg" ? "jpg" : originalExt;
      } else {
        return NextResponse.json(
          { ok: false, error: "Invalid file type. Only images (PNG, JPG, GIF, WebP, SVG) and PDFs are allowed." },
          { status: 400 }
        );
      }
    }

    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(bytes);
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const path = join(uploadDir, fileName);

    await writeFile(path, buffer);

    return NextResponse.json({ ok: true, url: `/uploads/${fileName}` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
