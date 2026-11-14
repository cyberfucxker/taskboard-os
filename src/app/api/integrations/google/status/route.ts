import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canLinkGoogleFor } from "@/lib/oauth-state";
import { disconnect, IntegrationError } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/status
 *
 * Reports whether a Google OAuth app has been configured for this org
 * (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env). Real Google Calendar /
 * Meet integration needs an OAuth app registered in Google Cloud Console —
 * that credential can only come from the org admin, so this endpoint exists
 * to give the UI an honest "not connected" state instead of faking a link.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return NextResponse.json({
    ok: true,
    configured,
    message: configured
      ? "Google OAuth app is configured. Employees can connect their Google account."
      : "Google OAuth app is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server .env (from a Google Cloud Console OAuth 2.0 Client with the Calendar API enabled) to turn this on.",
  });
}


/**
 * DELETE /api/integrations/google/status?employeeId=xxx
 *
 * Unlinks a Google calendar/Meet connection. The settings tab lets an admin
 * pick the employee, so the target may be someone other than the session —
 * permission-checked the same way the connect route is. Without an
 * `employeeId` this acts on the caller, which is what the hub does.
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const target = new URL(req.url).searchParams.get("employeeId") || session.user.id;
    if (!canLinkGoogleFor(session.user.id, session.user.role, target)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await disconnect(target, "google");
    return NextResponse.json({ ok: true, employeeId: target });
  } catch (e) {
    if (e instanceof IntegrationError) {
      return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.status });
    }
    console.error("[integrations/google/disconnect]", e);
    return NextResponse.json({ error: "Could not disconnect" }, { status: 500 });
  }
}
