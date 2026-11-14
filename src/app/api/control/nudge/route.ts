import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { alertEmployee } from "@/lib/alerting";

export const dynamic = "force-dynamic";

/** Leadership → employee nudge. Reuses the alert engine (bell + optional push). */
export async function POST(req: Request) {
  const session = await requireRole("hrms.manage");
  const { employeeId, message } = await req.json().catch(() => ({}));
  if (!employeeId || typeof employeeId !== "string") {
    return NextResponse.json({ ok: false, error: "employeeId required" }, { status: 400 });
  }
  await alertEmployee({
    employeeId,
    title: "👋 Leadership check-in",
    detail: typeof message === "string" && message.trim()
      ? message.trim()
      : "Leadership is checking in — anything you need help unblocking?",
    kind: "alert",
    severity: "High",
    notify: true,
  });
  return NextResponse.json({ ok: true });
}