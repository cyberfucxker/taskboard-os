/**
 * Where the CRM lives on the public internet.
 *
 * The legacy CRM ran the API as its own Express process (PUBLIC_BASE_URL, e.g. https://api.example.com)
 * with the admin panel on another origin (CLIENT_ORIGIN). In TaskBoard both are the one Next.js app:
 * the API is mounted at /api/crm/* and the screens at /crm/*. These URLs are handed to third
 * parties — Meta, Airphone, WhatsApp, an email provider's inbound hook — so they must be the
 * public HTTPS origin, not localhost; set PUBLIC_BASE_URL in production.
 */
const origin = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

/** The public origin of this TaskBoard deployment. */
export const PUBLIC_ORIGIN = origin;

/** Base URL of the CRM API — every webhook URL shown to an admin is built on this. */
export const CRM_API_BASE = `${origin}/api/crm`;

/** Where browser redirects (e.g. the end of the Meta OAuth flow) send people back to. */
export const APP_ORIGIN = (process.env.CLIENT_ORIGIN || origin).replace(/\/+$/, "");
