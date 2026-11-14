import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import { getDeptBySlug } from "@/lib/dept-metrics";
import { canViewAnyDept, canViewDept } from "@/lib/dept-access";
import { DeptDashboard, DeptDenied } from "@/components/dept/DeptDashboard";
import type { DeptScope } from "@/components/dept/types";

export const dynamic = "force-dynamic";

/** Roles that open their own department with the whole team in view by default. */
const LEAD_ROLES = new Set(["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "HR"]);
// Lead roles get the whole-team view of THEIR OWN department only; they gain no cross-department access.

export default async function DeptPage({
  params, searchParams,
}: {
  params: { slug: string };
  searchParams: { scope?: string | string[] };
}) {
  const session = (await getServerSession(authOptions)) as ScopedSession | null;
  if (!session?.user?.id) redirect("/login");

  const slug = params.slug;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) notFound();

  const me = session.user;
  const ownSlug = me.departmentSlug ?? null;
  const homeHref = ownSlug ? `/dept/${ownSlug}` : "/overview";

  // Same capability floor as the other universal pages (workspace.access).
  const caps = await effectiveCapsForSession(session);
  if (!caps.has("workspace.access")) return <DeptDenied homeHref="/overview" />;

  const dept = await getDeptBySlug(slug);
  if (!dept) notFound();

  // Own department only; SUPER_ADMIN and Leadership members may open any (see lib/dept-access.ts).
  const isOwn = ownSlug === slug;
  const canViewAny = canViewAnyDept(me);
  if (!canViewDept(me, slug)) return <DeptDenied homeHref={homeHref} />;

  // Viewing another department: there is no "mine" there, so only the whole-department view.
  const hasMine = isOwn;
  const isLead = isOwn && (LEAD_ROLES.has(me.role) || canViewAny);
  const requested = Array.isArray(searchParams.scope) ? searchParams.scope[0] : searchParams.scope;
  let scope: DeptScope = requested === "mine" || requested === "all" ? requested : isLead ? "all" : "mine";
  if (!hasMine) scope = "all";

  const deptNav = canViewAny
    ? await prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { slug: true, name: true } })
    : [];

  return (
    <DeptDashboard
      dept={dept}
      scope={scope}
      userId={me.id}
      showToggle={hasMine}
      deptNav={deptNav}
      today={new Date()}
      showAcross={isLead || scope === "mine"}
    />
  );
}
