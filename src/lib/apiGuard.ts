/**
 * apiGuard.ts - R2: deny-by-default API auth
 *
 * Public-route allowlist for src/middleware.ts.
 * Routes here have their OWN auth (signature, cron secret, agent secret,
 * CRM dispatch auth) - adding one here does NOT remove the per-route check.
 */

export const PUBLIC_API_PREFIXES: string[] = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/recurring-tasks/generate",
  "/api/standup/check",
  "/api/tasks/overdue-check",
  "/api/device/register",
  "/api/device/activity",
  "/api/device/commands",
  "/api/client-error",
  "/api/health",
  "/api/push/vapid-key",
  "/api/crm/",
  "/api/mcp", // x-agent-secret / Bearer checked in the route
];

export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) =>
      pathname.startsWith(prefix) ||
      pathname === prefix.replace(/\/$/, "")
  );
}
