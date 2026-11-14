import { NextResponse } from "next/server";

/**
 * Shared guard for the small set of routes that exist ONLY to be called by
 * root's crontab over localhost (`curl -H "x-cron-secret: ..." ...`), never
 * by a logged-in user. There is no session for a cron job to hold, so this
 * can't use requireRole() — but leaving them open to anyone who can reach
 * the URL (including over the public domain, if the reverse proxy forwards
 * /api/* to this same port) is a real, unauthenticated data-exposure/action
 * hole. Requires CRON_SECRET to be set in .env and sent as a header.
 */
export function verifyCronSecret(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured on the server" },
      { status: 500 }
    );
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
