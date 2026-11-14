import type { Metadata } from "next";
import { guardPage } from "@/lib/pages";
import { effectiveCapsForSession } from "@/lib/scope";
import { SettingsHub } from "@/components/settings/SettingsHub";

export const metadata: Metadata = { title: "Settings & Integrations · TaskBoard OS" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await guardPage("Settings");
  // Settings is gated only by the universal `workspace.access` capability —
  // every employee can open this page. Passing these as props to a client
  // component serializes them into the RSC/flight payload for EVERY viewer
  // regardless of role, even though SettingsHub only *renders* them for
  // leadership — the values themselves were still shipped to every browser
  // (visible via view-source/React DevTools) before this fix. Only compute
  // the real values for a viewer who actually holds the leadership role that
  // SettingsHub's own tab gates require; everyone else gets empty strings.
  const isSecretsAdmin = session.user.role === "SUPER_ADMIN" || session.user.role === "DEPARTMENT_HEAD";
  const agentSecret = isSecretsAdmin ? process.env.AGENT_SECRET ?? "" : "";
  const whatsappVerifyToken = isSecretsAdmin ? process.env.WHATSAPP_VERIFY_TOKEN ?? "" : "";
  const metaVerifyToken = isSecretsAdmin ? process.env.META_VERIFY_TOKEN ?? "" : "";
  const caps = await effectiveCapsForSession(session as any);
  const canManageOthers = caps.has("board.view") || caps.has("admin.scope");

  return (
    <SettingsHub
      currentRole={session.user.role}
      agentSecret={agentSecret}
      whatsappVerifyToken={whatsappVerifyToken}
      metaVerifyToken={metaVerifyToken}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? undefined}
      canManageOthers={canManageOthers}
    />
  );
}
