import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { canLinkGoogleFor, createOAuthState } from "@/lib/oauth-state";
import { buildAuthorizationUrl, IntegrationError } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

/**
 * GET /api/integrations/google/connect?employeeId=xxx
 *
 * Starts the Google OAuth consent flow for one employee's calendar/Meet
 * connection. Requires GOOGLE_CLIENT_ID (and matching Console redirect URI)
 * to be set — until then this returns a clear "not configured" error instead
 * of a broken redirect.
 *
 * The `state` parameter is a signed, expiring token (see @/lib/oauth-state)
 * that binds this consent attempt to BOTH the target employee and the session
 * that started it. The callback refuses to act unless the signature, the
 * expiry, and the current session all check out.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google OAuth app not configured. Ask an admin to add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to the server, with this exact redirect URI registered in Google Cloud Console: " +
          new URL("/api/integrations/google/callback", req.url).toString(),
      },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId") || session.user.id;

  if (!canLinkGoogleFor(session.user.id, session.user.role, employeeId)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const redirectUri = new URL("/api/integrations/google/callback", req.url).toString();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  // Signed + expiring + bound to the initiating session.
  authUrl.searchParams.set(
    "state",
    createOAuthState(employeeId, session.user.id)
  );

  return NextResponse.redirect(authUrl.toString());
}

/**
 * POST /api/integrations/google/connect
 *
 * The new hub UI starts every connection with POST, but a static
 * `google/connect` segment outranks `[provider]/connect` in the Next router, so
 * Google needs its own POST here or it answers 405. It delegates to the same
 * engine as every other provider — including encrypted token storage on the
 * callback — rather than duplicating the OAuth handshake.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // The admin-facing settings tab picks whose calendar this is, so the
    // target employee may differ from the session. The OAuth state already
    // separates `subject` (whose account is linked) from `initiator` (whose
    // session is bound to the callback), so all this route must do is refuse
    // an actor who may not act for that subject.
    const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown };
    const asked = new URL(req.url).searchParams.get("employeeId");
    const target =
      typeof body.employeeId === "string" && body.employeeId
        ? body.employeeId
        : asked || session.user.id;
    if (!canLinkGoogleFor(session.user.id, session.user.role, target)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const origin = new URL(req.url).origin;
    const start = await buildAuthorizationUrl({
      providerKey: "google",
      employeeId: target,
      initiatedByUserId: session.user.id,
      origin,
    });

    const raw = start.cookie.sameSite;
    const sameSite: "lax" | "strict" | "none" =
      raw === "none" ? "none" : raw === "strict" ? "strict" : "lax";

    const res = NextResponse.json({ authorizeUrl: start.authorizeUrl, scopes: start.scopes });
    res.cookies.set({
      name: start.cookie.name,
      value: start.cookie.value,
      maxAge: start.cookie.maxAge,
      httpOnly: start.cookie.httpOnly,
      sameSite,
      path: start.cookie.path,
      secure: start.cookie.secure,
    });
    return res;
  } catch (e) {
    if (e instanceof IntegrationError) {
      return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.status });
    }
    console.error("[integrations/google/connect]", e);
    return NextResponse.json({ error: "Could not start the connection" }, { status: 500 });
  }
}
