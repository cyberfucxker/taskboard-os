import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { guardPage } from "@/lib/pages";
import { getEmployeeProfile } from "@/lib/data/employees";
import { EmployeeProfile } from "@/components/team/EmployeeProfile";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * Employee profile — the destination `EntityLink`'s `person` type already
 * points at (`entityUrl("person", id)` → `/team/${id}`, see src/lib/url.ts).
 * Reuses the "Directory" page-grant, same way /clients/[id] reuses "Clients".
 */
export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
  await guardPage("Directory");
  const session = (await getServerSession(authOptions)) as ScopedSession;
  if (!session?.user?.id) redirect("/login");
  const profile = await getEmployeeProfile(session, params.id);
  if (!profile) notFound();
  const caps = await effectiveCapsForSession(session);
  const canCreateTask = profile.workVisible && caps.has("tasks.manage");
  return (
    <EmployeeProfile
      data={profile}
      canCreateTask={canCreateTask}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? "You"}
    />
  );
}
