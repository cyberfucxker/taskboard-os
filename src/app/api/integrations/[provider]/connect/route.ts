// POST /api/integrations/[provider]/connect — start the OAuth dance.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildAuthorizationUrl, IntegrationError } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { provider: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // An employee only ever links their *own* account. Admin-on-behalf-of was
    // the original Google takeover path, so self-only is deliberate.
    const employeeId = session.user.id;
    const provider = params.provider.toLowerCase();

    let bundleIds: string[] | undefined;
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { bundles?: unknown };
      if (Array.isArray(body.bundles) && body.bundles.length) {
        bundleIds = (body.bundles as unknown[]).filter(
          (b): b is string => typeof b === "string"
        );
      }
    }

    const origin = new URL(req.url).origin;
    const start = await buildAuthorizationUrl({
      providerKey: provider,
      employeeId,
      initiatedByUserId: employeeId,
      origin,
      bundleIds,
    });

    // `start.cookie.sameSite` arrives as a plain string, but Next wants the
    // literal union — collapse it explicitly rather than casting blindly.
    const rawSameSite = start.cookie.sameSite;
    const sameSite: "lax" | "strict" | "none" =
      rawSameSite === "none" ? "none" : rawSameSite === "strict" ? "strict" : "lax";

    const res = NextResponse.json({
      authorizeUrl: start.authorizeUrl,
      scopes: start.scopes,
    });
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
      // The engine already encodes the right status (404 unknown provider,
      // 409 no app credentials, 400 bad request) — don't re-derive it from
      // `kind`, which loses the distinction.
      return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.status });
    }
    console.error("[integrations/connect]", e);
    return NextResponse.json({ error: "Could not start the connection" }, { status: 500 });
  }
}
