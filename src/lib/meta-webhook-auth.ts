import crypto from "crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` HMAC on a webhook POST body.
 *
 * Meta signs every delivery with your app's secret. Without checking it,
 * anyone who can reach these public URLs can POST a forged payload and have it
 * treated as genuine — on the leads webhook that means injecting fake leads
 * into the CRM, and on the WhatsApp webhook it means running employee commands
 * (`/log`, `/done`, `/tasks`) as somebody who merely knows a phone number.
 *
 * A missing secret is therefore a FAILURE, not a skip. It used to fail open
 * "so capture would start automatically once someone added the secret", but
 * that left both webhooks writable by anyone in the meantime, and neither can
 * receive genuine traffic before the app secret exists anyway. Set the App
 * Secret (Meta App Dashboard -> Settings -> Basic) to turn delivery on.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  resolvedAppSecret?: string | null
): { ok: boolean; reason?: string } {
  // Env first, then the admin-entered encrypted row. Reading only
  // process.env meant that saving credentials through the admin UI appeared to
  // do nothing — the signature check and the Graph fetch both kept seeing an
  // unset secret.
  const appSecret = resolvedAppSecret ?? process.env.META_APP_SECRET;
  if (!appSecret) {
    return { ok: false, reason: "META_APP_SECRET not configured — refusing unsigned payload" };
  }
  if (!signatureHeader) {
    return { ok: false, reason: "missing X-Hub-Signature-256 header" };
  }
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}
