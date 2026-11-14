import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid-key — public VAPID key for the browser to subscribe.
 *
 * Only returns a key when push is FULLY configured (public + private + subject
 * — see `pushConfigured()`). It used to return the public key alone, so a
 * server with only the public key set would let the browser successfully
 * subscribe and the admin dashboard would report "notifications enabled" —
 * but `sendPushToEmployee()` silently no-ops on every real send because
 * `pushConfigured()` fails. Better to refuse to subscribe at all than to
 * subscribe into a system that can never deliver anything.
 */
export async function GET() {
  return NextResponse.json({
    key: pushConfigured() ? process.env.WEB_PUSH_VAPID_PUBLIC_KEY : null,
  });
}
