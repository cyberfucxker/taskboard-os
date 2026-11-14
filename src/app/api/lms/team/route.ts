import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getTeamProgress } from "@/lib/lms";

export const dynamic = "force-dynamic";

/**
 * GET /api/lms/team — every employee's course enrollment(s) + completion
 * counts, for the leadership "Team progress" view. Gated on `lms.manage`
 * (COO by default; any other manager only via an explicit override on
 * /access) — a rep with only `lms.view` gets 403 even by direct URL.
 */
export async function GET() {
  try {
    const session = await requireRole("lms.manage");
    const rows = await getTeamProgress(session);
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
