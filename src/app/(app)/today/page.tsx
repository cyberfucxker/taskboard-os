import { guardPage } from "@/lib/pages";
import { meToday } from "@/lib/time";
import { TodayV3 } from "@/components/today/v3/TodayV3";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: { scope?: string | string[] } }) {
  const session = await guardPage("Today");
  const init = await meToday(session.user.id);
  const scope = Array.isArray(searchParams.scope) ? searchParams.scope[0] : searchParams.scope;
  return (
    <TodayV3
      userId={session.user.id}
      name={init.employee?.name ?? ""}
      role={session.user.role}
      deptSlug={session.user.departmentSlug ?? null}
      init={init}
      requestedScope={scope}
    />
  );
}
