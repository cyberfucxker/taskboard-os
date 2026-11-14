import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { syncTeleCrmLeads, teleCrmSyncState } from "@/lib/leads/telecrm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cron/telecrm-sync
 *
 * Nightly job, called by the system timer on the box rather than by an
 * in-process scheduler so it survives a deploy and a crash.
 *
 * Auth is a shared secret compared in constant time. It is a cron endpoint, not
 * a user-facing one, and it never accepts a session cookie.
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

export async function POST(req: Request) {
  // TeleCRM sync disabled — leads come directly from Meta webhooks.
  if (process.env.TELECRM_SYNC_ENABLED !== "1") {
    return NextResponse.json({ ok: false, disabled: true, message: "TeleCRM sync is disabled. Set TELECRM_SYNC_ENABLED=1 to re-enable." }, { status: 200 });
  }
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxPagesParam = url.searchParams.get("maxPages");
  const maxPages = maxPagesParam ? Number(maxPagesParam) : undefined;

  const result = await syncTeleCrmLeads({
    dryRun,
    maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
  });

  const state = await teleCrmSyncState();
  // A missing Enterprise ID or Sync token is a setup problem, not a server
  // fault: reporting it as 500 makes every monitor and log scanner treat an
  // unconfigured integration as an outage. Only a genuine upstream failure is
  // a 5xx.
  const status = result.ok
    ? 200
    : result.code === "not_configured"
      ? 400
      : 502;
  return NextResponse.json({ ok: result.ok, result, state }, { status });
}
