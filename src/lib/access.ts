import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import type { Capability } from "@/lib/rbac";

/**
 * Server-component access guard for pages (CORE-01). Redirects to /login when
 * unauthenticated, /overview when the employee's EFFECTIVE capability set
 * (base role ⊕ department add-ons ⊕ per-employee overrides) lacks the required
 * capability. Overrides are read live from the DB, so a SUPER_ADMIN change on
 * the Access page applies to the very next request. The data layer still
 * enforces tenant isolation separately (P5 / CORE-01.5).
 *
 * Returns the session typed with the dept claims so callers can pass it to the
 * scope helpers without a second DB read.
 */
export async function guard(
  ...caps: Capability[]
): Promise<ScopedSession> {
  const session = (await getServerSession(authOptions)) as ScopedSession | null;
  if (!session?.user?.id) redirect("/login");
  if (caps.length) {
    const held = await effectiveCapsForSession(session);
    if (!caps.every((c) => held.has(c))) redirect("/overview");
  }
  return session;
}