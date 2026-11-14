import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Browser crash reports. The root layout forwards uncaught errors and unhandled rejections here
 * (sendBeacon), so a "client-side exception" on someone else's screen lands in the server journal
 * (journalctl -u taskboard-os | grep client-error) with its real message and stack. Unauthenticated
 * on purpose — a crash can happen before or during sign-in — so input is size-capped and only
 * ever logged, never stored or echoed back.
 */
export async function POST(req: Request) {
  try {
    const text = (await req.text()).slice(0, 8000);
    console.error("[client-error]", text.replace(/\s+/g, " "));
  } catch {
    // nothing useful to do
  }
  return new NextResponse(null, { status: 204 });
}
