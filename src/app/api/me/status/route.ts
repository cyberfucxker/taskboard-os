import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { meToday } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/status — the Today page + header stripe + check-in poll.
 * Returns the employee's shift-aware 8h status.
 */
export async function GET() {
  try {
    const session = await requireRole("workspace.access");
    const status = await meToday(session.user.id);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}