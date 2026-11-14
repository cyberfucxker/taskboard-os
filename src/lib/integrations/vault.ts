/**
 * Integration secret vault.
 *
 * WHY THIS EXISTS
 * `EmployeeIntegration.accessToken` / `.refreshToken` are `db.Text` columns and
 * were being written and read as PLAINTEXT. A single read-only SQL injection, a
 * leaked backup, a stray `psql` dump, or an over-broad admin API would hand over
 * every employee's Google refresh token — which is a long-lived credential that
 * can be replayed to read and write their mail, files and calendar.
 *
 * Every third-party token (OAuth access tokens, refresh tokens, API keys, webhook
 * secrets) is stored through this module instead:
 *
 *   - AES-256-GCM authenticated encryption, so tampering is detected, not just
 *     confidentiality.
 *   - The provider + employee id are bound in as AAD (additional authenticated
 *     data). A ciphertext copied from one row into another fails to decrypt
 *     rather than silently authenticating as a different user.
 *   - Ciphertext is versioned (`v1.<iv>.<tag>.<ct>`) so the scheme can be rotated
 *     later without a big-bang migration.
 *   - Nothing here ever logs, returns or serialises a secret to a client.
 *
 * KEY HANDLING
 * Prefers a dedicated 32-byte base64 key in INTEGRATION_ENCRYPTION_KEY. If that
 * is absent it derives a key from NEXTAUTH_SECRET via HKDF-SHA256 so a fresh
 * install is never left storing plaintext. Rotating NEXTAUTH_SECRET in the
 * fallback mode invalidates stored tokens (employees simply reconnect); setting
 * a dedicated key removes that coupling.
 */

import crypto from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32;

let warnedAboutDerivedKey = false;

/** Resolve the 32-byte vault key, preferring a dedicated integration secret. */
function vaultKey(): Buffer {
  const explicit = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `INTEGRATION_ENCRYPTION_KEY must be ${KEY_BYTES} bytes base64-encoded (got ${key.length}). ` +
          `Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
      );
    }
    return key;
  }

  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "No vault key available. Set INTEGRATION_ENCRYPTION_KEY (preferred) or NEXTAUTH_SECRET."
    );
  }

  if (!warnedAboutDerivedKey) {
    warnedAboutDerivedKey = true;
    console.warn(
      "[integrations/vault] INTEGRATION_ENCRYPTION_KEY not set — deriving the key from " +
        "NEXTAUTH_SECRET. Set a dedicated key so rotating the auth secret does not force " +
        "every employee to reconnect."
    );
  }

  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from("taskboard.integration.vault", "utf8"),
      Buffer.from(VERSION, "utf8"),
      KEY_BYTES
    )
  );
}

/**
 * Bind a secret to the row that owns it. Include this on every encrypt/decrypt
 * call so a token cannot be moved between employees or providers.
 */
export function aadFor(provider: string, ownerId: string): string {
  return `${VERSION}:${provider.toLowerCase()}:${ownerId}`;
}

export function encryptSecret(plaintext: string, aad: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: refusing to encrypt an empty value");
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(".");
}

/** True when a stored value is already a vault envelope rather than plaintext. */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  return parts.length === 4 && parts[0] === VERSION;
}

export function decryptSecret(envelope: string, aad: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("decryptSecret: value is not a v1 vault envelope");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    vaultKey(),
    Buffer.from(ivB64, "base64")
  );
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Decrypt a stored value, tolerating rows written before the vault existed.
 * Returns null for empty values so callers can treat "not connected" uniformly.
 */
export function readSecret(
  stored: string | null | undefined,
  aad: string
): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored; // legacy plaintext row
  return decryptSecret(stored, aad);
}

/**
 * A non-reversible, stable label for a secret, safe to show in a UI or write to
 * a log. HMAC (not a plain hash) so it cannot be brute-forced or correlated
 * against a guessed token, and deliberately reveals nothing about the secret.
 */
export function secretFingerprint(secret: string): string {
  return crypto
    .createHmac("sha256", vaultKey())
    .update(`${VERSION}:fp:${secret}`)
    .digest("hex")
    .slice(0, 12);
}

/** Human-safe rendering for admin screens: `••••••••3f9a2c11`. */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "—";
  return `••••••••${secretFingerprint(secret)}`;
}
