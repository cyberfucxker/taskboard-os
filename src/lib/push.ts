import { prisma } from "@/lib/db";

/**
 * Web Push — free browser push service (no daemon, no per-machine setup).
 * Requires two env vars (generate once via `npx web-push generate-vapid-keys`):
 *   WEB_PUSH_VAPID_SUBJECT  = "mailto:you@example.com"
 *   WEB_PUSH_VAPID_PUBLIC_KEY  /  WEB_PUSH_VAPID_PRIVATE_KEY
 *
 * Until those are set, push sending is a no-op (the app keeps working; the
 * install-prompt + local notifications still function).
 */

export function pushConfigured(): boolean {
  return Boolean(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY &&
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
    process.env.WEB_PUSH_VAPID_SUBJECT
  );
}

/** Send a push to every device an employee has registered. Fire-and-forget. */
export async function sendPushToEmployee(
  employeeId: string,
  payload: { title: string; body?: string; url?: string },
) {
  if (!pushConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { employeeId } });
  if (subs.length === 0) return;

  // Dynamic import keeps web-push out of the server bundle unless configured.
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT!,
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
  );
  const body = JSON.stringify({ ...payload, tag: `taskboard-${Date.now()}` });

  const expired: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (e: any) {
        // 404/410 → subscription dead; drop it so we don't retry forever.
        if (e?.statusCode === 404 || e?.statusCode === 410) expired.push(sub.id);
      }
    }),
  );
  if (expired.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  }
}
