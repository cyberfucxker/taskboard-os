import type { Request } from "../express";
import type { DataScope } from "./hierarchy";
import { prisma } from "../prisma";

/**
 * The signed-in TaskBoard employee, as the ported CRM routes expect to find it on `req`.
 * The legacy CRM carried a JWT payload here; in TaskBoard the dispatcher (src/crm-server/index.ts)
 * resolves the NextAuth session before any route runs and attaches it in the same shape.
 */
export interface AuthPayload {
  sub: string;
  role: string;
  name?: string | null;
  departmentSlug?: string | null;
}

export interface AuthedRequest extends Request {
  auth?: AuthPayload;
  /** Whose CRM records this request may touch. Absent only on the public routes. */
  scope?: DataScope;
}

/**
 * Who is doing this, for the history and activity rows somebody reads back later. The fallback
 * is 'System', for the background engines, which act without a session — "System moved this
 * lead" is true where a person's name would be a lie.
 */
export async function actingUser(req: AuthedRequest): Promise<{ id: string; name: string }> {
  const user = req.auth
    ? await prisma.employee.findUnique({ where: { id: req.auth.sub }, select: { id: true, name: true } })
    : null;
  return { id: user?.id ?? "system", name: user?.name ?? "System" };
}
