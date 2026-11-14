import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getEnrollmentDetail } from "@/lib/lms";

export const dynamic = "force-dynamic";

/**
 * GET /api/lms/team/[enrollmentId] — one rep's full block-by-block written
 * work for one course (the drill-down behind the Team progress table).
 * Gated on `lms.manage` — this is the surface that exposes actual answer
 * text, so it stays behind the same leadership-only gate as /api/lms/team.
 */
export async function GET(_req: Request, { params }: { params: { enrollmentId: string } }) {
  try {
    const session = await requireRole("lms.manage");
    const enrollment = await getEnrollmentDetail(session, params.enrollmentId);
    return NextResponse.json({ ok: true, enrollment });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
