import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Signed, expiring OAuth `state` values.
 *
 * WHY THIS EXISTS
 *   /api/integrations/google/connect used to set `state` to the bare
 *   employeeId, and /api/integrations/google/callback used to read that value
 *   back as the employeeId to attach Google tokens to — with no session check
 *   in the callback at all.
 *
 *   That let anyone who completed a Google consent flow with their own account
 *   replay their own authorization `code` against
 *   `/api/integrations/google/callback?code=<theirs>&state=<any employeeId>`
 *   and bind their Google tokens to any employee record in the system.
 *
 * WHAT THIS PROVIDES
 *   1. Integrity    — HMAC-SHA256 over the payload; a tampered state is rejected.
 *   2. Freshness    — the state expires after STATE_TTL_SECONDS.
 *   3. Initiator binding — the state records who started the flow, and the
 *      callback re-checks that the *current session* is allowed to act for the
 *      subject. A stolen state alone is therefore not enough.
 *   4. Constant-time signature comparison.
 */

const STATE_TTL_SECONDS = 600; // 10 minutes — long enough for a consent screen

export interface OAuthStatePayload {
  /** Employee whose account is being linked. */
  subject: string;
  /** Employee whose session started the flow. */
  initiator: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  /**
   * Which provider this state authorises, and which scope bundles were offered.
   * Optional so states minted by the original Google-only flow stay valid; the
   * callback route is the authority when these are absent.
   */
  provider?: string;
  bundleIds?: string[];
}

function signingKey(): string {
  const key = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!key) {
    throw new Error(
      "Neither NEXTAUTH_SECRET nor AUTH_SECRET is set — cannot sign OAuth state."
    );
  }
  return key;
}

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function createOAuthState(
  subject: string,
  initiator: string,
  extra?: { provider?: string; bundleIds?: string[] }
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: OAuthStatePayload = {
    subject,
    initiator,
    issuedAt: now,
    expiresAt: now + STATE_TTL_SECONDS,
    nonce: randomBytes(16).toString("hex"),
    // Only set when supplied, so legacy two-argument calls produce byte-identical
    // payloads to before and no existing in-flight link changes shape.
    ...(extra?.provider ? { provider: extra.provider } : {}),
    ...(extra?.bundleIds?.length ? { bundleIds: extra.bundleIds } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type StateVerification =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: string };

export function verifyOAuthState(state: unknown): StateVerification {
  if (typeof state !== "string" || state.length === 0) {
    return { ok: false, reason: "missing" };
  }
  const dot = state.lastIndexOf(".");
  if (dot <= 0 || dot === state.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const body = state.slice(0, dot);
  const mac = state.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return { ok: false, reason: "server_misconfigured" };
  }

  const providedBuf = Buffer.from(mac, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "undecodable" };
  }

  if (
    typeof payload.expiresAt !== "number" ||
    typeof payload.subject !== "string" ||
    typeof payload.initiator !== "string" ||
    typeof payload.issuedAt !== "number" ||
    !payload.subject
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (
    payload.provider !== undefined &&
    typeof payload.provider !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (
    payload.bundleIds !== undefined &&
    (!Array.isArray(payload.bundleIds) ||
      payload.bundleIds.some((b) => typeof b !== "string"))
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (Math.floor(Date.now() / 1000) > payload.expiresAt) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/**
 * Roles permitted to start/link a Google connection on someone else's behalf.
 * Kept here so the connect route and the callback cannot drift apart — the
 * callback MUST apply exactly the same rule as the connect route, otherwise the
 * signed state is not actually enforcing anything.
 */
const INTEGRATION_LEADERSHIP = ["SUPER_ADMIN", "ADMIN", "HR"] as const;

export function canLinkGoogleFor(
  actorId: string,
  actorRole: string,
  subjectId: string
): boolean {
  if (actorId === subjectId) return true;
  return (INTEGRATION_LEADERSHIP as readonly string[]).includes(actorRole);
}
