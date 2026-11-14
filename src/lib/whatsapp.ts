import { prisma } from "@/lib/db";

/**
 * Sends a real WhatsApp Cloud API message using the org's configured
 * WHATSAPP_CLOUD credentials (Settings → Integrations & AI Agents). Throws a
 * clear, specific error instead of silently pretending to succeed when
 * nothing is configured or Meta rejects the request — a caller that wants to
 * degrade gracefully should catch and surface `error.message`.
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<{ messageId: string }> {
  const config = await (prisma as any).systemIntegrationConfig.findUnique({
    where: { provider: "WHATSAPP_CLOUD" },
  });

  const creds = (config?.credentialsJson as Record<string, string>) || {};
  const phoneNumberId = creds.phoneNumberId;
  const token = creds.permanentAccessToken;

  if (!config?.isEnabled || !phoneNumberId || !token) {
    throw new Error(
      "WhatsApp is not configured. Add credentials under Settings → Integrations & AI Agents → WhatsApp Business Cloud API."
    );
  }

  const normalizedPhone = to.replace(/^\+/, "").replace(/\s/g, "");
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "text",
      text: { body: message },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error?.error_data?.details || "Meta API returned an error";
    throw new Error(errMsg);
  }

  return { messageId: data?.messages?.[0]?.id || "unknown" };
}
