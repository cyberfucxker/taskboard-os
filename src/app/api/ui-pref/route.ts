import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Per-browser switch between the classic Today page and the TaskBoard 3 design.
 * GET /api/ui-pref?v=v3 | ?v=classic -> sets the `taskboard_ui` cookie, back to /today.
 * Cookie only: no DB write, so turning it off can never break anything else.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  }
  const v = new URL(req.url).searchParams.get("v") === "v3" ? "v3" : "classic";
  const res = new NextResponse(null, { status: 303, headers: { Location: "/today" } });
  res.cookies.set("taskboard_ui", v, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
  return res;
}
