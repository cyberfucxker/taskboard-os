/**
 * Provider credential resolution.
 *
 * ONE JOB: answer "does this org have a value for CONFIG_KEY, and what is it?"
 * from two possible places, without either one being able to see the other's
 * secrets by accident.
 *
 *   1. The server environment. Present for deployments that inject secrets
 *      through the host. Cannot be edited from the app, which is why the admin
 *      screen below exists at all.
 *   2. `SystemIntegrationConfig.credentialsJson`, written by the admin screen.
 *      Values flagged `secret: true` in the registry are stored as vault
 *      envelopes; the rest are stored as plain text so an admin can read back
 *      which tenant or domain is configured.
 *
 * ORDER MATTERS: the environment wins. A host operator who injects a value
 * explicitly has already made that decision out of band, and a stale row in
 * the database must not silently override it. The admin screen still reports
 * those keys as "set" so nobody is misled into re-entering them.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: expose a value to a browser. Only
 * `providerConfigStatus` (booleans and fingerprints) leaves the server, and it
 * is admin-gated at the route.
 */
import { prisma } from "@/lib/db";
import { aadFor, decryptSecret, encryptSecret, isEncrypted } from "./vault";
import { getProvider, listProviders, type ProviderDef, type RequiredConfig } from "./registry";

/** AAD owner for org-wide credentials. Distinct from any employee owner id. */
const ORG_OWNER = "org";

/** Environment beats database. Keep this comment with the order. */
const ENV_FIRST = true;

/** Short cache so a settings page render does not fan out one query per key. */
const CACHE_TTL_MS = 5_000;

type CacheEntry = { at: number; data: Record<string, string> };
let cache: Map<string, CacheEntry> | null = null;

function now(): number {
  return Date.now();
}

function readCache(provider: string): Record<string, string> | null {
  if (!cache) return null;
  const hit = cache.get(provider);
  if (!hit) return null;
  if (now() - hit.at > CACHE_TTL_MS) {
    cache.delete(provider);
    return null;
  }
  return hit.data;
}

function writeCache(provider: string, data: Record<string, string>): void {
  if (!cache) cache = new Map();
  cache.set(provider, { at: now(), data });
}

/** Drop cached credentials for a provider. Call after any write. */
export function invalidateCredentialCache(provider?: string): void {
  if (!cache) return;
  if (provider) cache.delete(provider);
  else cache = null;
}

/**
 * Row key for the shared `SystemIntegrationConfig` table.
 *
 * The table already holds a different set of rows keyed by legacy enum names
 * ("WHATSAPP_CLOUD", ...) that `lib/whatsapp.ts` reads. Keying these rows by
 * the lowercase registry key ("whatsapp", "google", ...) keeps the two sets
 * apart instead of silently overwriting each other.
 */
function providerRowName(p: ProviderDef): string {
  return p.key.toLowerCase();
}

/** Raw stored values for one provider, decrypted. Never send this to a client. */
export async function storedCredentials(providerKey: string): Promise<Record<string, string>> {
  const key = providerKey.toLowerCase();
  const cached = readCache(key);
  if (cached) return cached;

  const p = getProvider(key);
  if (!p) return {};

  const row = await (prisma as any).systemIntegrationConfig.findUnique({
    where: { provider: providerRowName(p) },
    select: { credentialsJson: true },
  });

  const raw = (row?.credentialsJson ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};

  for (const cfg of p.requiredConfig) {
    const v = raw[cfg.key];
    if (typeof v !== "string" || v.length === 0) continue;
    if (cfg.secret && isEncrypted(v)) {
      try {
        out[cfg.key] = decryptSecret(v, aadFor(key, ORG_OWNER));
      } catch {
        // A key rotation or a restored-from-old-backup row. Treat as unset
        // rather than crashing every OAuth call in the app.
        out[cfg.key] = "";
      }
    } else if (isEncrypted(v)) {
      // A value that is now marked non-secret but was stored encrypted.
      try {
        out[cfg.key] = decryptSecret(v, aadFor(key, ORG_OWNER));
      } catch {
        out[cfg.key] = "";
      }
    } else {
      out[cfg.key] = v;
    }
  }

  writeCache(key, out);
  return out;
}

/**
 * The resolved value for one config key, or null when the org has not set it.
 * Environment first, then the admin-entered row.
 */
export async function resolveConfigValue(
  providerKey: string,
  configKey: string
): Promise<string | null> {
  if (ENV_FIRST) {
    const fromEnv = process.env[configKey]?.trim();
    if (fromEnv) return fromEnv;
  }
  const stored = await storedCredentials(providerKey);
  const v = stored[configKey]?.trim();
  return v ? v : null;
}

/** True when the value exists in either place. */
export async function hasConfigValue(
  providerKey: string,
  configKey: string
): Promise<boolean> {
  if (process.env[configKey]?.trim()) return true;
  const stored = await storedCredentials(providerKey);
  return Boolean(stored[configKey]?.trim());
}

/** Required keys still missing. Mirrors registry.missingConfig, DB-aware. */
export async function missingConfigFor(p: ProviderDef): Promise<RequiredConfig[]> {
  const out: RequiredConfig[] = [];
  for (const c of p.requiredConfig) {
    if (c.optional) continue;
    if (!(await hasConfigValue(p.key, c.key))) out.push(c);
  }
  return out;
}

/** Optional keys still unset. Advisory only, never blocks a connection. */
export async function missingOptionalFor(p: ProviderDef): Promise<RequiredConfig[]> {
  const out: RequiredConfig[] = [];
  for (const c of p.requiredConfig) {
    if (!c.optional) continue;
    if (!(await hasConfigValue(p.key, c.key))) out.push(c);
  }
  return out;
}

export async function isProviderConfiguredFor(p: ProviderDef): Promise<boolean> {
  return (await missingConfigFor(p)).length === 0;
}

/** Where a resolved value came from. Surfaced to admins so they are not confused. */
export type ConfigSource = "env" | "database";

export type ConfigKeyStatus = {
  key: string;
  label: string;
  secret: boolean;
  optional: boolean;
  help?: string;
  set: boolean;
  source: ConfigSource | null;
  /**
   * Last 4 characters, for a secret. Lets an admin tell "the new value" from
   * "the value from three months ago" without ever reading the secret back.
   */
  hint: string | null;
};

export type ProviderConfigStatus = {
  provider: string;
  name: string;
  configured: boolean;
  keys: ConfigKeyStatus[];
  missingKeys: string[];
};

function hintFor(secret: boolean, value: string | null): string | null {
  if (!value) return null;
  if (!secret) return value.length <= 64 ? value : `${value.slice(0, 60)}\u2026`;
  if (value.length <= 4) return "\u2022".repeat(value.length);
  return `${"\u2022".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

/**
 * Everything the admin screen renders: which keys are set, where from, and a
 * masked hint for secrets. No full secret is ever included in the return.
 */
export async function providerConfigStatus(): Promise<ProviderConfigStatus[]> {
  const out: ProviderConfigStatus[] = [];
  for (const p of listProviders()) {
    const keys: ConfigKeyStatus[] = [];
    const missing: string[] = [];

    for (const c of p.requiredConfig) {
      const inEnv = Boolean(process.env[c.key]?.trim());
      const stored = await storedCredentials(p.key);
      const storedValue = stored[c.key] ?? null;
      const set = inEnv || Boolean(storedValue);
      const source: ConfigSource | null = inEnv ? "env" : storedValue ? "database" : null;

      if (!set && !c.optional) missing.push(c.key);

      keys.push({
        key: c.key,
        label: c.label,
        secret: c.secret,
        optional: Boolean(c.optional),
        help: c.help,
        set,
        source,
        hint: set ? hintFor(c.secret, inEnv ? process.env[c.key]!.trim() : storedValue) : null,
      });
    }

    out.push({
      provider: p.key,
      name: p.name,
      configured: missing.length === 0,
      keys,
      missingKeys: missing,
    });
  }
  return out;
}

/**
 * Persist admin-entered values. Secrets are encrypted with the vault and bound
 * to this provider, so a row copied from another provider will not decrypt.
 * A blank value clears the key rather than storing an empty string.
 */
export async function saveProviderCredentials(
  providerKey: string,
  values: Record<string, string | undefined>
): Promise<{ saved: string[]; cleared: string[] }> {
  const p = getProvider(providerKey);
  if (!p) throw new Error("Unknown provider.");

  const known = new Set(p.requiredConfig.map((c) => c.key));
  const saved: string[] = [];
  const cleared: string[] = [];

  const existing = await (prisma as any).systemIntegrationConfig.findUnique({
    where: { provider: providerRowName(p) },
    select: { credentialsJson: true },
  });
  const current: Record<string, string> = {
    ...((existing?.credentialsJson ?? {}) as Record<string, string>),
  };

  for (const [key, raw] of Object.entries(values)) {
    if (!known.has(key)) continue;

    const value = (raw ?? "").trim();
    if (value === "") {
      if (key in current) {
        delete current[key];
        cleared.push(key);
      }
      continue;
    }

    const cfg = p.requiredConfig.find((c) => c.key === key)!;
    current[key] = cfg.secret
      ? encryptSecret(value, aadFor(p.key, ORG_OWNER))
      : value;
    saved.push(key);
  }

  await (prisma as any).systemIntegrationConfig.upsert({
    where: { provider: providerRowName(p) },
    create: {
      provider: providerRowName(p),
      name: p.name,
      category: "AUTOMATION",
      isEnabled: true,
      status: "CONFIGURED",
      credentialsJson: current,
    },
    update: {
      credentialsJson: current,
      status: "CONFIGURED",
    },
  });

  invalidateCredentialCache(p.key);
  return { saved, cleared };
}
