import { NextResponse } from "next/server";
import { analyzeMeeting } from "@/lib/salesEngine";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("sales.engine.manage");
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: (err as { status?: number }).status ?? 401 }
    );
  }
  try {

    return NextResponse.json({ ok: true, analysis: analyzeMeeting() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}