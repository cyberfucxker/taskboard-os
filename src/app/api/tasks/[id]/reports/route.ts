import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scopedTaskWhere, type ScopedSession } from "@/lib/scope";
import { sendPushToEmployee } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Task Reports — lightweight in-DB file attachments (replaces Slack drops).
 *
 * GET  /api/tasks/[id]/reports  → list all reports for a task (metadata only, no blob).
 * POST /api/tasks/[id]/reports  → upload a report (multipart/form-data).
 *
 * Files are stored as BYTEA in the DB (max 10 MB). This keeps the stack
 * zero-dependency — no S3, no presigned URLs. Works fine for PDFs, images,
 * CSVs, and screenshots at this team's scale.
 *
 * Downloading a file: GET /api/tasks/[id]/reports/[reportId]/file
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "text/",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument",
  "application/msword",
  "application/zip",
  "video/mp4",
  "video/webm",
];

const REPORT_KINDS = [
  "DAILY_REPORT",
  "WEEKLY_REPORT",
  "DESIGN_REVIEW",
  "BUG_REPORT",
  "GENERAL",
] as const;

function isAllowedMime(mime: string) {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function metaView(r: {
  id: string;
  kind: string;
  title: string;
  note: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  authorId: string | null;
  author: { id: string; name: string } | null;
}) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
    authorId: r.authorId,
    author: r.author?.name ?? "Unknown",
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
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

    const reports = await prisma.taskReport.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        title: true,
        note: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        authorId: true,
        author: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, reports: reports.map(metaView) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = (await getServerSession(authOptions)) as ScopedSession | null;
    if (!session?.user?.id)
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

    const task = await prisma.task.findFirst({
      where: { id: params.id, deletedAt: null, ...(await scopedTaskWhere(session)) },
      select: {
        id: true,
        code: true,
        assigneeId: true,
        creatorId: true,
        assignees: { select: { employeeId: true } },
      },
    });
    if (!task)
      return NextResponse.json({ ok: false, error: "Task not found or not in your scope" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null)?.trim();
    const note = (formData.get("note") as string | null)?.trim() || null;
    const kind = (formData.get("kind") as string | null) ?? "GENERAL";

    if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
    if (!REPORT_KINDS.includes(kind as (typeof REPORT_KINDS)[number]))
      return NextResponse.json({ ok: false, error: "Invalid report kind" }, { status: 400 });
    if (!isAllowedMime(file.type))
      return NextResponse.json({ ok: false, error: `File type not allowed: ${file.type}` }, { status: 400 });
    if (file.size > MAX_BYTES)
      return NextResponse.json({ ok: false, error: `File too large (max 10 MB)` }, { status: 400 });
    if (title.length > 200)
      return NextResponse.json({ ok: false, error: "Title too long (max 200 chars)" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    const report = await prisma.taskReport.create({
      data: {
        taskId: task.id,
        authorId: session.user.id,
        kind: kind as (typeof REPORT_KINDS)[number],
        title,
        note,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        data,
      },
      select: { id: true, kind: true, title: true, note: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, authorId: true },
    });

    // Notify task owner(s) — same pattern as comments.
    const targets = new Set<string>();
    if (task.assigneeId) targets.add(task.assigneeId);
    if (task.creatorId) targets.add(task.creatorId);
    for (const a of task.assignees) if (a.employeeId) targets.add(a.employeeId);
    targets.delete(session.user.id);

    if (targets.size > 0) {
      const authorName = session.user.name ?? "Someone";
      const title_ = `${authorName} submitted a report on ${task.code}`;
      const detail = `${title} — ${file.name}`;
      await prisma.notification.createMany({
        data: [...targets].map((employeeId) => ({
          employeeId,
          title: title_,
          detail,
          severity: "Info" as const,
          kind: "report",
        })),
      });
      for (const empId of targets) {
        void sendPushToEmployee(empId, {
          title: title_,
          body: detail,
          url: `/tasks?task=${task.code}`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      report: {
        ...report,
        createdAt: report.createdAt.toISOString(),
        author: session.user.name ?? "Unknown",
      },
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
