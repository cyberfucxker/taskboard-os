import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { effectiveCapsForSession } from "@/lib/scope";
import { emitEvent } from "@/lib/eventlog";
import { ALL_CAPABILITIES, type AccessOverrides, type Capability } from "@/lib/rbac";
import { ALL_PAGES, type PageSlug } from "@/lib/pages";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/access/[id] — SUPER_ADMIN ("admin.scope") edits ONE employee's
 * role and/or per-employee allow/deny override chips. This is the "I'm in
 * control of what each employee sees" surface (CORE-01). Overrides are read
 * live on every guard, so the change applies on the employee's next request.
 *
 * Body: { role?, allow? (Capability[]), deny? (Capability[]) }
 *   - role:  optional new Role (gated on admin.roles too).
 *   - allow: optional array; replaces the whole allow list.
 *   - deny:  optional array; replaces the whole deny list.
 * Omitted fields are left untouched. Either of allow/deny may be [] to clear.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireRole("admin.scope");
  const { role, pages, allow, deny } = (await req.json()) as {
    role?: Role;
    pages?: PageSlug[];
    allow?: Capability[];
    deny?: Capability[];
  };

  const target = await prisma.employee.findUnique({ where: { id: params.id } });
  if (!target) return Response.json({ error: "Employee not found" }, { status: 404 });

  // Guard rails: role changes additionally need admin.roles; and a role that
  // is not in our enum (or a malformed capability) is rejected outright.
  if (role !== undefined) {
    const held = await effectiveCapsForSession(session);
    const canChangeRoles =
      session.user.role === "SUPER_ADMIN" ||
      session.user.role === "HR" ||
      held.has("admin.roles");
    if (!canChangeRoles) {
      return Response.json({ error: "Role changes require admin.roles" }, { status: 403 });
    }
    const allowedRoles: Role[] = [
      "SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "SENIOR_EXECUTIVE",
      "EXECUTIVE", "INTERN", "ACCOUNT_MANAGER", "HR", "FINANCE",
      "CLIENT_ADMIN", "CLIENT_VIEWER", "EXTERNAL_CONTRACTOR",
    ];
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }
  }

  // Never allow the last SUPER_ADMIN to be demoted, and refuse self-demotion.
  if (role && role !== "SUPER_ADMIN" && target.role === "SUPER_ADMIN") {
    if (params.id === session.user.id) {
      return Response.json({ error: "You cannot downgrade your own account" }, { status: 400 });
    }
    const admins = await prisma.employee.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
    if (admins <= 1) {
      return Response.json({ error: "Cannot demote the last SUPER_ADMIN" }, { status: 400 });
    }
  }

  // Drop any legacy capability names against the known set — mirrors the
  // page-slug handling below. A capability removed from the system (e.g. the
  // old "catalog.view") must not permanently lock out every future edit to
  // an employee whose stored overrides still reference it.
  const validAllow = allow !== undefined
    ? allow.filter((c) => ALL_CAPABILITIES.includes(c))
    : undefined;
  const validDeny = deny !== undefined
    ? deny.filter((c) => ALL_CAPABILITIES.includes(c))
    : undefined;

  // Validate page slugs against the known module set — silently drop any
  // legacy slugs (e.g. "SEO", "SMM") that were removed from ALL_PAGES so
  // old stored pageAccess arrays don't block saves.
  const validPages = pages !== undefined
    ? pages.filter((p) => ALL_PAGES.includes(p))
    : undefined;

  const data: Record<string, unknown> = {};
  if (role !== undefined) data.role = role;
  if (validPages !== undefined) data.pageAccess = validPages;
  if (validAllow !== undefined || validDeny !== undefined) {
    const current = (target.accessOverrides ?? {}) as AccessOverrides;
    // Also scrub any legacy capability already sitting in the untouched half
    // of the stored overrides so a save that only touches "allow" still
    // clears a stale "deny" (and vice versa).
    if (current.allow) current.allow = current.allow.filter((c) => ALL_CAPABILITIES.includes(c));
    if (current.deny) current.deny = current.deny.filter((c) => ALL_CAPABILITIES.includes(c));
    if (validAllow !== undefined) current.allow = validAllow;
    if (validDeny !== undefined) current.deny = validDeny;
    // Normalise: drop empty lists so the stored chip state stays clean.
    if (!current.allow?.length) delete current.allow;
    if (!current.deny?.length) delete current.deny;
    data.accessOverrides = Object.keys(current).length ? current : null;
  }

  if (Object.keys(data).length) {
    await prisma.employee.update({ where: { id: params.id }, data });
    emitEvent({
      type: "ROLE_SWITCHED",
      actorId: session.user.id,
      entityType: "employee",
      entityId: params.id,
      payload: {
        v: 1,
        action: "access.update",
        role: role ?? undefined,
        pages: pages ?? undefined,
        allow: allow ?? undefined,
        deny: deny ?? undefined,
      },
    }).catch(() => undefined);
  }

  return Response.json({ ok: true });
}