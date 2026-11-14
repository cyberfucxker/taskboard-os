import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { myTimeLog } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/time/me — 7-day time report for the logged-in employee.
 * Returns per-day rows + a weekly category summary.
 */
export async function GET() {
  try {
    const session = await requireRole("workspace.access");
    const days = await myTimeLog(session.user.id, 7);

    // Weekly category summary (productive seconds per task category).
    const catMs: Record<string, number> = {};
    for (const d of days) {
      for (const e of d.entries) {
        if (e.source !== "manual") catMs[e.category] = (catMs[e.category] ?? 0) + e.ms;
      }
    }
    const categorySummary = Object.entries(catMs)
      .map(([category, ms]) => ({ category, hrs: +(ms / 3600000).toFixed(2) }))
      .sort((a, b) => b.hrs - a.hrs);

    return NextResponse.json({ ok: true, days, categorySummary });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}