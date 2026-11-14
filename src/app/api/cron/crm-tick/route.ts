import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runCrmTick } from "@/crm-server/tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST (or GET) /api/cron/crm-tick
 *
 * One pass of the CRM's background work — automation delay resumer, no-activity triggers,
 * follow-up reminders, AI SDR due pass. Meant to be called every minute by the system timer on
 * the box, which replaces the setInterval pollers the the legacy CRM server ran in-process.
 *
 * Auth is identical to /api/cron/telecrm-sync: the CRON_SECRET shared secret in the
 * `x-cron-secret` header, compared in constant time. Never a session cookie.
 */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  const summary = await runCrmTick();
  // A step that threw is a real fault the timer's monitoring should see, so it is a 500 — but
  // the steps that did run are still reported.
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export const POST = handle;
export const GET = handle;
