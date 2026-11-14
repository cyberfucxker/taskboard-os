/**
 * Generic OAuth 2.0 engine for employee integrations.
 *
 * Every provider in the registry runs through this one code path, so adding
 * Microsoft or Slack later is a registry entry, not new auth code.
 *
 * WHAT THIS FIXES relative to the old hand-rolled Google flow
 *  - PKCE (S256) on every authorisation, so an intercepted auth code is useless
 *    without the verifier, which stays in an httpOnly cookie and never touches
 *    the URL, browser history or referrer headers.
 *  - Tokens are encrypted through the vault before they touch the database.
 *  - Refresh is single-flight: twenty concurrent requests that all see an
 *    expired token issue ONE refresh, not twenty. Providers that rotate refresh
 *    tokens invalidate the old one on each use, so the old code silently
 *    disconnected people by refreshing in a loop.
 *  - A refresh token that has been revoked is detected (invalid_grant) and the
 *    connection is marked as needing re-consent instead of retrying forever.
 *  - Every connect, refresh, failure and disconnect is written to the activity
 *    log, so there is an answer to "who gave access to what, when".
 */

import { prisma } from "@/lib/db";
import { createOAuthState, verifyOAuthState } from "@/lib/oauth-state";
import {
  aadFor,
  encryptSecret,
  isEncrypted,
  readSecret,
} from "@/lib/integrations/vault";
import { resolveConfigValue } from "@/lib/integrations/credentials";
import {
  getProvider,
  listProviders,
  effectiveScopes,
  type ProviderDef,
} from "@/lib/integrations/registry";

const VERIFIER_COOKIE = "taskboard_pkce";
const VERIFIER_TTL_MS = 10 * 60 * 1000;
/** Refresh this far ahead of expiry so a request never races the clock. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** In-process single-flight map. Valid for a single Node process (systemd). */
const inFlightRefresh = new Map<string, Promise<string>>();

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "not_configured"
      | "invalid_state"
      | "exchange_failed"
      | "revoked"
      | "not_connected"
      | "provider_error",
    readonly status = 400
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  return base64url(require("node:crypto").randomBytes(bytes));
}

function sha256(input: string): string {
  return base64url(
    require("node:crypto").createHash("sha256").update(input).digest()
  );
}

/**
 * Resolve one config value for a provider.
 *
 * Now async and DB-aware: the environment still wins, but an org that entered
 * credentials through Settings → Provider credentials gets a working connect
 * flow without anyone editing files on the host.
 * See lib/integrations/credentials.ts for the ordering and encryption rules.
 */
async function configValue(p: ProviderDef, key: string): Promise<string | null> {
  return resolveConfigValue(p.key, key);
}

export async function providerClientId(p: ProviderDef): Promise<string | null> {
  if (p.key === "google") return configValue(p, "GOOGLE_CLIENT_ID");
  if (p.key === "zoom") return configValue(p, "ZOOM_CLIENT_ID");
  if (p.key === "microsoft") return configValue(p, "MS_CLIENT_ID");
  if (p.key === "slack") return configValue(p, "SLACK_CLIENT_ID");
  if (p.key === "github") return configValue(p, "GITHUB_CLIENT_ID");
  if (p.key === "notion") return configValue(p, "NOTION_CLIENT_ID");
  return null;
}

export async function providerClientSecret(p: ProviderDef): Promise<string | null> {
  if (p.key === "google") return configValue(p, "GOOGLE_CLIENT_SECRET");
  if (p.key === "zoom") return configValue(p, "ZOOM_CLIENT_SECRET");
  if (p.key === "microsoft") return configValue(p, "MS_CLIENT_SECRET");
  if (p.key === "slack") return configValue(p, "SLACK_CLIENT_SECRET");
  if (p.key === "github") return configValue(p, "GITHUB_CLIENT_SECRET");
  if (p.key === "notion") return configValue(p, "NOTION_CLIENT_SECRET");
  return null;
}

async function assertUsable(p: ProviderDef): Promise<void> {
  if (p.auth !== "oauth2") {
    throw new IntegrationError(`${p.name} does not use OAuth.`, "not_configured", 400);
  }
  if (!(await providerClientId(p)) || !(await providerClientSecret(p))) {
    throw new IntegrationError(
      `${p.name} is not configured yet. An admin must add its client ID and secret.`,
      "not_configured",
      503
    );
  }
}

/** Should we ask Google for a hosted-domain / work-only consent screen? */
async function googlePrompt(): Promise<string | undefined> {
  const hd = await configValue({ key: "google" } as ProviderDef, "GOOGLE_WORKSPACE_DOMAIN");
  return hd || undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorisation
// ─────────────────────────────────────────────────────────────────────────────

export interface StartAuthInput {
  providerKey: string;
  employeeId: string;
  initiatedByUserId: string;
  origin: string;
  /** Extra bundles the org admin has enabled beyond the provider defaults. */
  bundleIds?: string[];
}

export interface StartAuthResult {
  authorizeUrl: string;
  /** Cookie the caller must set on the response. */
  cookie: { name: string; value: string; maxAge: number; httpOnly: boolean; sameSite: string; path: string; secure: boolean };
  scopes: string[];
}

/**
 * Build the provider authorisation URL. Returns a cookie spec rather than
 * setting the cookie so this stays usable from a Route Handler.
 */
export async function buildAuthorizationUrl(
  input: StartAuthInput
): Promise<StartAuthResult> {
  const p = getProvider(input.providerKey);
  if (!p) throw new IntegrationError("Unknown provider.", "not_configured", 404);
  await assertUsable(p);

  const bundleIds = input.bundleIds?.length ? input.bundleIds : p.defaultBundles;
  // effectiveScopes always folds in prerequisite bundles (e.g. "identify"), so
  // a caller selecting a single feature bundle can never under-request scopes.
  const scopes = effectiveScopes(p, bundleIds);
  if (scopes.length === 0) {
    throw new IntegrationError("No scopes are enabled for this provider.", "not_configured", 400);
  }

  // PKCE: verifier lives only in an httpOnly cookie; the challenge is public.
  const verifier = randomString(48);
  const state = createOAuthState(
    input.employeeId,
    input.initiatedByUserId,
    { provider: p.key, bundleIds }
  );

  const url = new URL(p.authUrl!);
  url.searchParams.set("client_id", (await providerClientId(p))!);
  url.searchParams.set("redirect_uri", `${input.origin}/api/integrations/${p.key}/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", sha256(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline"); // ask for a refresh token
  url.searchParams.set("prompt", "consent"); // ensure a refresh token is issued
  if (p.key === "google") {
    const hd = await googlePrompt();
    if (hd) url.searchParams.set("hd", hd);
  }
  if (p.key === "slack") url.searchParams.set("user_scope", scopes.join(","));

  return {
    authorizeUrl: url.toString(),
    cookie: {
      name: `${VERIFIER_COOKIE}_${p.key}`,
      value: verifier,
      maxAge: Math.floor(VERIFIER_TTL_MS / 1000),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: input.origin.startsWith("https://"),
    },
    scopes,
  };
}

export function verifierCookieName(providerKey: string): string {
  return `${VERIFIER_COOKIE}_${providerKey}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  account?: string; // Slack
  error?: string;
  error_description?: string;
}

async function exchangeCode(
  p: ProviderDef,
  code: string,
  verifier: string,
  origin: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: (await providerClientId(p))!,
    client_secret: (await providerClientSecret(p))!,
    redirect_uri: `${origin}/api/integrations/${p.key}/callback`,
    code_verifier: verifier,
  });

  const res = await fetch(p.tokenUrl!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  let json: TokenResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new IntegrationError(
      `${p.name} returned an unreadable token response.`,
      "exchange_failed",
      502
    );
  }

  if (!res.ok || json.error || !json.access_token) {
    const detail = json.error_description || json.error || `HTTP ${res.status}`;
    throw new IntegrationError(
      `${p.name} rejected the authorisation: ${detail}`,
      json.error === "invalid_grant" ? "revoked" : "exchange_failed",
      502
    );
  }
  return json;
}

/**
 * Finish the flow: verify state, exchange the code, encrypt and persist tokens,
 * then record the connection in the activity log.
 */
export async function completeAuthorization(input: {
  providerKey: string;
  code: string;
  state: string;
  verifier: string | null;
  origin: string;
  /** The user whose session is making this callback. */
  sessionUserId: string;
  accountEmail?: string | null;
}): Promise<{ provider: string; employeeId: string; accountEmail: string | null; scopes: string[] }> {
  const p = getProvider(input.providerKey);
  if (!p) throw new IntegrationError("Unknown provider.", "not_configured", 404);
  await assertUsable(p);

  const verifiedResult = verifyOAuthState(input.state);
  if (!verifiedResult.ok) {
    throw new IntegrationError(
      "This connection link has expired or was tampered with. Please start again.",
      "invalid_state",
      400
    );
  }
  const verified = verifiedResult.payload;
  // The session that started the flow must be the session finishing it.
  if (verified.initiator !== input.sessionUserId) {
    throw new IntegrationError(
      "This connection was started in a different session. Please start again.",
      "invalid_state",
      403
    );
  }
  // Older states (issued before the generic engine) carry no provider; the
  // callback route itself is the authority in that case.
  if (verified.provider && verified.provider !== p.key) {
    throw new IntegrationError("Provider mismatch in callback.", "invalid_state", 400);
  }
  if (!input.verifier) {
    throw new IntegrationError(
      "Missing PKCE verifier cookie. Please start again.",
      "invalid_state",
      400
    );
  }

  const bundleIds = verified.bundleIds?.length ? verified.bundleIds : p.defaultBundles;

  const tokens = await exchangeCode(p, input.code, input.verifier, input.origin);

  const aad = aadFor(p.key, verified.subject);
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const granted = tokens.scope
    ? tokens.scope.split(/[\s,]+/).filter(Boolean)
    : effectiveScopes(p, bundleIds);

  await prisma.employeeIntegration.upsert({
    where: {
      employeeId_provider: {
        employeeId: verified.subject,
        provider: p.key,
      },
    },
    create: {
      employeeId: verified.subject,
      provider: p.key,
      accountEmail: input.accountEmail ?? null,
      accessToken: encryptSecret(tokens.access_token, aad),
      refreshToken: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token, aad)
        : null,
      tokenExpiresAt: expiresAt,
      isActive: true,
      settings: {
        grantedScopes: granted,
        bundleIds,
        encryptedAt: new Date().toISOString(),
      } as any,
    },
    update: {
      accountEmail: input.accountEmail ?? undefined,
      accessToken: encryptSecret(tokens.access_token, aad),
      refreshToken: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token, aad)
        : undefined,
      tokenExpiresAt: expiresAt,
      isActive: true,
      settings: {
        grantedScopes: granted,
        bundleIds,
        encryptedAt: new Date().toISOString(),
      } as any,
    },
  });

  await logIntegrationEvent(verified.subject, p.key, "connected", {
    grantedScopes: granted,
  });

  return {
    provider: p.key,
    employeeId: verified.subject,
    accountEmail: input.accountEmail ?? null,
    scopes: granted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Token access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a usable access token, refreshing it if needed.
 * Call this instead of touching the token columns directly.
 */
export async function getValidAccessToken(
  employeeId: string,
  providerKey: string
): Promise<string> {
  const p = getProvider(providerKey);
  if (!p) throw new IntegrationError("Unknown provider.", "not_configured", 404);

  const row = await findIntegrationRow(employeeId, p);
  if (!row || !row.isActive) {
    throw new IntegrationError(`${p.name} is not connected.`, "not_connected", 409);
  }

  const aad = aadFor(p.key, employeeId);
  const expiresAt = row.tokenExpiresAt?.getTime() ?? 0;
  const needsRefresh = !row.tokenExpiresAt || expiresAt - Date.now() < REFRESH_SKEW_MS;

  if (!needsRefresh) {
    const access = readSecret(row.accessToken, aad);
    if (access) return access;
  }

  return refreshNow(employeeId, p);
}

/** Single-flight refresh. Concurrent callers share one provider round-trip. */
async function refreshNow(
  employeeId: string,
  p: ProviderDef
): Promise<string> {
  const flightKey = `${employeeId}:${p.key}`;
  const existing = inFlightRefresh.get(flightKey);
  if (existing) return existing;

  const job = (async () => {
    const row = await findIntegrationRow(employeeId, p);
    if (!row) {
      throw new IntegrationError(`${p.name} is not connected.`, "not_connected", 409);
    }

    const aad = aadFor(p.key, employeeId);
    const refreshToken = readSecret(row.refreshToken, aad);
    if (!refreshToken) {
      // Nothing to refresh with — the employee must consent again.
      await markNeedsReconnect(employeeId, p, "No refresh token stored.");
      throw new IntegrationError(
        `${p.name} needs to be reconnected.`,
        "revoked",
        409
      );
    }

    const res = await fetch(p.tokenUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: (await providerClientId(p))!,
        client_secret: (await providerClientSecret(p))!,
      }),
      cache: "no-store",
    });

    const text = await res.text();
    let json: TokenResponse;
    try {
      json = JSON.parse(text);
    } catch {
      throw new IntegrationError(
        `${p.name} returned an unreadable refresh response.`,
        "exchange_failed",
        502
      );
    }

    if (!res.ok || json.error || !json.access_token) {
      const revoked = json.error === "invalid_grant";
      if (revoked) {
        await markNeedsReconnect(employeeId, p, "Access was revoked at the provider.");
      }
      throw new IntegrationError(
        revoked
          ? `${p.name} access was revoked. Please reconnect.`
          : `${p.name} refresh failed: ${json.error_description || json.error || res.status}`,
        revoked ? "revoked" : "exchange_failed",
        502
      );
    }

    const data: any = {
      accessToken: encryptSecret(json.access_token, aad),
      tokenExpiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000)
        : null,
      isActive: true,
    };
    // Google may rotate the refresh token; keeping the old one breaks the link.
    if (json.refresh_token) {
      data.refreshToken = encryptSecret(json.refresh_token, aad);
    }

    await prisma.employeeIntegration.update({ where: { id: row.id }, data });

    await logIntegrationEvent(employeeId, p.key, "token_refreshed", {});
    return json.access_token;
  })();

  inFlightRefresh.set(flightKey, job);
  try {
    return await job;
  } finally {
    inFlightRefresh.delete(flightKey);
  }
}

async function markNeedsReconnect(
  employeeId: string,
  p: ProviderDef,
  reason: string
): Promise<void> {
  const row = await findIntegrationRow(employeeId, p);
  if (!row) return;
  await prisma.employeeIntegration.update({
    where: { id: row.id },
    data: {
      isActive: false,
      settings: {
        needsReconnect: true,
        reason,
        at: new Date().toISOString(),
      } as any,
    },
  });
  await logIntegrationEvent(employeeId, p.key, "needs_reconnect", { reason });
}

// ─────────────────────────────────────────────────────────────────────────────
// Disconnect & status
// ─────────────────────────────────────────────────────────────────────────────

export async function disconnect(
  employeeId: string,
  providerKey: string,
  opts: { revokeAtProvider?: boolean } = {}
): Promise<void> {
  const p = getProvider(providerKey);
  if (!p) throw new IntegrationError("Unknown provider.", "not_configured", 404);

  const row = await findIntegrationRow(employeeId, p);
  if (!row) return;

  if (opts.revokeAtProvider !== false) {
    const aad = aadFor(p.key, employeeId);
    const token = readSecret(row.refreshToken, aad) ?? readSecret(row.accessToken, aad);
    if (token && p.key === "google") {
      // Best-effort: make sure the grant is dead at Google, not just here.
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        cache: "no-store",
      }).catch(() => undefined);
    }
  }

  // Null the secrets rather than deleting the row, so the audit trail of what
  // was once connected survives. The manual providers store a credential too —
  // a private iCal feed is a bearer secret, and a pasted link or phone number
  // is the only thing that integration runs on — so those go with the tokens.
  // `disconnectedAt` still records that the row was once live.
  await prisma.employeeIntegration.update({
    where: { id: row.id },
    data: {
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      icalUrl: null,
      personalMeetUrl: null,
      calendlyUrl: null,
      whatsappPhone: null,
      isActive: false,
      accountEmail: null,
      settings: { disconnectedAt: new Date().toISOString() } as any,
    },
  });

  await logIntegrationEvent(employeeId, p.key, "disconnected", {});
}

export interface ConnectionStatus {
  key: string;
  name: string;
  connected: boolean;
  needsReconnect: boolean;
  accountEmail: string | null;
  expiresAt: string | null;
  grantedScopes: string[];
  bundleIds: string[];
  /** Legacy rows written before the vault existed still hold plaintext. */
  needsTokenEncryption: boolean;
}

/**
 * Find an employee's row for a provider, whatever case it was written in.
 *
 * The registry keys are lowercase ("ical", "google"), but the older
 * settings form and its API have always upper-cased the provider before
 * storing it ("ICAL", "GOOGLE"). `employeeId_provider` is a plain unique
 * index, so an exact-match lookup on the lowercase key silently misses every
 * row written that older way — which is why disconnect and token refresh
 * appeared to do nothing for those connections. `connectionsFor` already
 * folded case when reading; every other read has to fold it too.
 */
async function findIntegrationRow(employeeId: string, p: ProviderDef) {
  const direct = await prisma.employeeIntegration.findUnique({
    where: { employeeId_provider: { employeeId, provider: p.key } },
  });
  if (direct) return direct;
  const legacy = await prisma.employeeIntegration.findFirst({
    where: {
      employeeId,
      provider: { equals: p.key.toUpperCase(), mode: "insensitive" },
    },
  });
  if (legacy) return legacy;
  // "teams" and "calendly" were never registry keys but were stored all the
  // same, so fall back to a case-insensitive match on the key itself.
  return prisma.employeeIntegration.findFirst({
    where: { employeeId, provider: { equals: p.key, mode: "insensitive" } },
  });
}


/**
 * Does this row hold something the rest of the app can actually use?
 *
 * OAuth rows carry a token. A manual row (iCal feed) or a settings row
 * (personal Meet link, WhatsApp number, booking link) carries a URL or
 * number instead, and is equally connected from the user's point of view.
 */
function hasUsableCredential(row: {
  accessToken?: string | null;
  refreshToken?: string | null;
  icalUrl?: string | null;
  personalMeetUrl?: string | null;
  calendlyUrl?: string | null;
  whatsappPhone?: string | null;
}): boolean {
  return Boolean(
    row.accessToken ||
      row.refreshToken ||
      row.icalUrl ||
      row.personalMeetUrl ||
      row.calendlyUrl ||
      row.whatsappPhone
  );
}


export async function connectionsFor(
  employeeId: string
): Promise<ConnectionStatus[]> {
  const rows = await prisma.employeeIntegration.findMany({
    where: { employeeId },
  });
  const byKey = new Map(rows.map((r) => [String(r.provider).toLowerCase(), r]));

  return listProviders()
    .filter((p) => p.connection === "per_employee" || p.connection === "org_wide")
    .map((p) => {
      const row = byKey.get(p.key);
      const settings = (row?.settings ?? {}) as Record<string, any>;
      return {
        key: p.key,
        name: p.name,
        // `accessToken` only exists for OAuth providers. A manual one (the
        // iCal feed) or a URL/number-based setting (a personal Meet link, a
        // WhatsApp number) is just as connected, so accepting only a token
        // made the hub tell configured users to connect what they had
        // already set up.
        connected: Boolean(row?.isActive && hasUsableCredential(row)),
        needsReconnect: Boolean(settings.needsReconnect),
        accountEmail: row?.accountEmail ?? null,
        expiresAt: row?.tokenExpiresAt?.toISOString() ?? null,
        grantedScopes: Array.isArray(settings.grantedScopes) ? settings.grantedScopes : [],
        bundleIds: Array.isArray(settings.bundleIds) ? settings.bundleIds : [],
        needsTokenEncryption: Boolean(
          row?.accessToken && !isEncrypted(row.accessToken)
        ),
      };
    });
}

async function logIntegrationEvent(
  employeeId: string,
  provider: string,
  action: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        type: "TASK_UPDATED" as any,
        actorId: employeeId,
        entityType: "integration",
        entityId: provider,
        payload: { v: 1, action, provider, ...meta } as any,
        meta: { source: "integrations" } as any,
      },
    });
  } catch (err) {
    // Never let audit-log trouble break a user's connection flow.
    console.error("[integrations] could not write activity log:", err);
  }
}
