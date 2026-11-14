import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/integrations/vault";

/**
 * CRM credential encryption (Meta page tokens, app secrets, telephony / WhatsApp / email keys).
 * The legacy CRM used crypto-js with its own ENCRYPTION_KEY; TaskBoard already has an AES-256-GCM vault
 * keyed by INTEGRATION_ENCRYPTION_KEY, so CRM secrets use that rather than a second key.
 * Every CRM secret is bound to the same AAD so an envelope cannot be replayed into the
 * per-employee integration tables, or the other way round.
 */
const AAD = "v1:crm:credentials";

export function encrypt(plainText: string): string {
  return encryptSecret(plainText, AAD);
}

export function decrypt(cipherText: string): string {
  if (!isEncrypted(cipherText)) return cipherText;
  return decryptSecret(cipherText, AAD);
}
