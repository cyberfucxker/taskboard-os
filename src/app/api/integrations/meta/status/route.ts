import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveConfigValue } from "@/lib/integrations/credentials";
import { testPageToken, getManagedPages } from "@/lib/metaService";

export const dynamic = "force-dynamic";

/** Mirrors the gate the provider-credential routes already use. */
function isAdmin(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "DEPARTMENT_HEAD";
}

/**
 * GET /api/integrations/meta/status
 *
 * Reports what is actually true, rather than what a UI badge wishes were true.
 *
 * The settings page used to show a hardcoded "Live & Receiving" green pill that
 * appeared whether or not a single credential had been entered. Every step is
 * reported separately so a half-configured setup shows exactly which link in
 * the chain is missing.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: "Forbidden. Administrative privileges required." },
        { status: 403 }
      );
    }

    const appId = await resolveConfigValue("meta_ads", "META_APP_ID");
    const appSecret = await resolveConfigValue("meta_ads", "META_APP_SECRET");
    const pageId = await resolveConfigValue("meta_ads", "META_PAGE_ID");
    const pageToken = await resolveConfigValue("meta_ads", "META_PAGE_ACCESS_TOKEN");
    const verifyToken = await resolveConfigValue("meta_ads", "META_VERIFY_TOKEN");
    const userToken = await resolveConfigValue("meta_ads", "META_USER_ACCESS_TOKEN");

    const steps = [
      {
        key: "app",
        label: "Meta App created",
        done: !!(appId && appSecret),
        detail: appId
          ? "App ID and secret are set."
          : "Add the App ID and App Secret from the Meta App Dashboard.",
      },
      {
        key: "verify_token",
        label: "Webhook verify token set",
        done: !!verifyToken,
        detail: verifyToken
          ? "The same value must be pasted into Meta's webhook field."
          : "Set a verify token; TaskBoard uses it to complete the webhook handshake.",
      },
      {
        key: "page",
        label: "Page selected",
        done: !!pageId,
        detail: pageId ? "A Page is selected." : "Connect a Page so lead answers can be fetched.",
      },
      {
        key: "token",
        label: "Page access token valid",
        done: false,
        detail: "Not checked yet.",
      },
    ];

    // Only reach out to Graph when there is something to check with.
    let tokenResult: { success: boolean; message: string } | null = null;
    if (pageId && pageToken) {
      tokenResult = await testPageToken(pageId, pageToken);
      steps[3].done = tokenResult.success;
      steps[3].detail = tokenResult.message;
    } else {
      steps[3].detail = "Add a Page access token to verify it against Graph.";
    }

    // Can we list pages? That needs a user token from the OAuth handshake.
    let pages: { id: string; name: string }[] | null = null;
    let pagesError: string | null = null;
    if (userToken) {
      try {
        pages = (await getManagedPages(userToken)).map((p) => ({ id: p.id, name: p.name }));
      } catch (err) {
        pagesError = (err as Error).message;
      }
    }

    const configured = steps.every((s) => s.done);
    return NextResponse.json({
      ok: true,
      configured,
      // "Live" is only claimed when the token actually verified. Everything
      // else is a partial state, labelled honestly.
      status: configured ? "live" : tokenResult?.success ? "partial" : "not_configured",
      steps,
      pages,
      pagesError,
      callbackUrl: "https://taskboard.example.com/api/webhooks/meta-leads",
      hasUserToken: !!userToken,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
