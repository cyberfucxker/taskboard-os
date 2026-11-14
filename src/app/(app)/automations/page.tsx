import { guardPage } from "@/lib/pages";
import { AutomationsHub } from "@/components/automations/AutomationsHub";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const session = await guardPage("Automations");
  return (
    <AutomationsHub
      currentRole={session.user.role}
      currentDeptSlug={session.user.departmentSlug ?? null}
    />
  );
}
