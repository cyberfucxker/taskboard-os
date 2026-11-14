import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scopedTaskWhere, type ScopedSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id]/reports/[reportId]/file
 *
 * Streams the raw file bytes back with the correct Content-Type and
 * Content-Disposition headers so the browser can inline-preview (images/PDF)
 * or download (everything else).
 *
 * The blob is never exposed through the list endpoint — only through this
 * dedicated route, gated by the same task-scope check.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; reportId: string } }
) {
  try {
    const session = (await getServerSession(authOptions)) as ScopedSession | null;
    if (!session?.user?.id)
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

    // Verify the caller can see the task.
    const visible = await prisma.task.findFirst({
      where: { id: params.id, deletedAt: null, ...(await scopedTaskWhere(session)) },
      select: { id: true },
    });
    if (!visible)
      return NextResponse.json({ ok: false, error: "Task not found or not in your scope" }, { status: 403 });

    const report = await prisma.taskReport.findFirst({
      where: { id: params.reportId, taskId: params.id },
      select: { data: true, fileName: true, mimeType: true },
    });
    if (!report)
      return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });

    // Inline for viewable types (image, pdf); download for everything else.
    const inlineMimes = ["image/", "application/pdf"];
    const disposition = inlineMimes.some((p) => report.mimeType.startsWith(p))
      ? `inline; filename="${encodeURIComponent(report.fileName)}"`
      : `attachment; filename="${encodeURIComponent(report.fileName)}"`;

    return new NextResponse(new Uint8Array(report.data), {
      headers: {
        "Content-Type": report.mimeType,
        "Content-Disposition": disposition,
        "Content-Length": String(report.data.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

/**
 * DELETE /api/tasks/[id]/reports/[reportId]/file
 *
 * Author or leadership can delete a report.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; reportId: string } }
) {
  try {
    const session = (await getServerSession(authOptions)) as ScopedSession | null;
    if (!session?.user?.id)
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

    const visible = await prisma.task.findFirst({
      where: { id: params.id, deletedAt: null, ...(await scopedTaskWhere(session)) },
      select: { id: true },
    });
    if (!visible)
      return NextResponse.json({ ok: false, error: "Task not found or not in your scope" }, { status: 403 });

    const report = await prisma.taskReport.findFirst({
      where: { id: params.reportId, taskId: params.id },
      select: { id: true, authorId: true },
    });
    if (!report)
      return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });

    const isLeadership = ["SUPER_ADMIN", "DEPARTMENT_HEAD", "HR"].includes(
      session.user.role ?? ""
    );
    if (!isLeadership && report.authorId !== session.user.id)
      return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

    await prisma.taskReport.delete({ where: { id: report.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
