// GET /api/integrations/[provider]/callback — finish OAuth, then bounce to the
// employee-facing page with a plain-language result.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { completeAuthorization, verifierCookieName } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { provider: string } }
) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const origin = new URL(req.url).origin;
  const done = (result: string) =>
    NextResponse.redirect(`${origin}/settings?tab=integrations&${result}`);

  // Always clear the verifier cookie, success or failure.
  const clear = (res: NextResponse) => {
    res.cookies.set({
      name: verifierCookieName(params.provider),
      value: "",
      maxAge: 0,
      path: "/",
      httpOnly: true,
    });
    return res;
  };

  if (oauthError) {
    // The employee declined, or the provider refused. Not an error worth alarming.
    return clear(done(`connected=0&provider=${params.provider}`));
  }
  if (!code || !state) {
    return clear(done(`connected=0&provider=${params.provider}&reason=incomplete`));
  }

  const session = await getSession();
  if (!session?.user?.id) {
    return clear(done(`connected=0&provider=${params.provider}&reason=session`));
  }

  // PKCE verifier lives in an httpOnly cookie set by /connect.
  const verifier = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${verifierCookieName(params.provider)}=`))
    ?.slice(verifierCookieName(params.provider).length + 1) ?? null;

  try {
    await completeAuthorization({
      providerKey: params.provider,
      code,
      state,
      verifier,
      origin,
      sessionUserId: session.user.id,
    });
    return clear(done(`connected=1&provider=${params.provider}`));
  } catch (e) {
    // Log the real reason server-side; the employee gets something actionable.
    console.error(`[integrations/${params.provider}/callback]`, e);
    return clear(done(`connected=0&provider=${params.provider}&reason=failed`));
  }
}
