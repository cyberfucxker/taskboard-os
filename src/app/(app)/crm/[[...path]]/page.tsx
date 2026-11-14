import { redirect } from "next/navigation";
import { guardPage } from "@/lib/pages";
import { crmAudience } from "@/crm-server/services/hierarchy";
import { CrmApp } from "@/crm-ui/CrmApp";

export const dynamic = "force-dynamic";

/**
 * The CRM (ported from the the legacy CRM platform). Every `/crm/...` URL lands on this optional
 * catch-all so a hard refresh anywhere inside the CRM works; the client-side router in
 * `CrmApp` picks the screen. Data comes from `/api/crm/*`, which re-checks access itself.
 */
export default async function CrmPage() {
  const session = await guardPage("CRM");
  // The CRM is for Sales + Leadership only (COO decision 2026-09-29), whatever the page grant says.
  if (!(await crmAudience(session.user.id)).allowed) redirect("/today");

  return (
    <CrmApp
      initialSession={{
        id: session.user.id,
        name: session.user.name ?? "",
        role: session.user.role,
        // Refined by GET /api/crm/me on mount — the server decides these.
        isFullAccess: session.user.role === "SUPER_ADMIN",
        canManage: false,
        canAdmin: session.user.role === "SUPER_ADMIN",
      }}
    />
  );
}
