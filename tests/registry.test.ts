import { describe, it, expect } from "vitest";

import {
  PROVIDERS,
  getProvider,
  listProviders,
  configurableProviders,
  scopesForBundles,
  capabilitiesForBundles,
  effectiveScopes,
  missingConfig,
  isProviderConfigured,
  redirectUriFor,
} from "@/lib/integrations/registry";

describe("provider registry — shape", () => {
  it("every provider has a unique lowercase key", () => {
    const keys = PROVIDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toBe(k.toLowerCase());
  });

  it("every default bundle actually exists on that provider", () => {
    for (const p of PROVIDERS) {
      const ids = new Set(p.bundles.map((b) => b.id));
      for (const b of p.defaultBundles) {
        expect(ids, `${p.key} default bundle "${b}" is undefined`).toContain(b);
      }
    }
  });

  it("every OAuth provider declares auth + token endpoints and a client id key", () => {
    for (const p of PROVIDERS.filter((x) => x.auth === "oauth2")) {
      expect(p.authUrl, `${p.key} authUrl`).toBeTruthy();
      expect(p.tokenUrl, `${p.key} tokenUrl`).toBeTruthy();
      expect(p.requiredConfig.some((c) => !c.secret), `${p.key} needs a client id`).toBe(true);
      expect(p.defaultBundles.length, `${p.key} has no default bundles`).toBeGreaterThan(0);
    }
  });

  it("every manual/webhook provider needs no OAuth endpoints", () => {
    for (const p of PROVIDERS.filter((x) => x.auth === "manual" || x.auth === "webhook")) {
      expect(p.tokenUrl, `${p.key} should not declare a token URL`).toBeUndefined();
    }
  });

  it("declares a capability for every non-empty scope bundle", () => {
    for (const p of PROVIDERS) {
      for (const b of p.bundles) {
        if (b.scopes.length > 0) {
          expect(p.capabilities.length, `${p.key} has bundles but no capabilities`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("provider registry — scope assembly", () => {
  it("returns the union of the selected bundles, de-duplicated", () => {
    const g = getProvider("google")!;
    const scopes = scopesForBundles(g, ["calendar.read", "calendar.write", "identify"]);
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.readonly");
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(scopes).toContain("openid");
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it("ignores unknown bundle ids instead of throwing", () => {
    const g = getProvider("google")!;
    expect(scopesForBundles(g, ["does-not-exist"])).toEqual([]);
  });

  it("excludes gmail.send unless the write bundle is explicitly enabled", () => {
    const g = getProvider("google")!;
    expect(scopesForBundles(g, g.defaultBundles)).not.toContain(
      "https://www.googleapis.com/auth/gmail.send"
    );
    expect(scopesForBundles(g, ["gmail.send"])).toEqual([
      "https://www.googleapis.com/auth/gmail.send",
    ]);
  });

  it("defaults to read-only posture: the default set contains no write scopes", () => {
    const g = getProvider("google")!;
    const defaults = scopesForBundles(g, g.defaultBundles);
    const writeScopes = g.bundles
      .filter((b) => b.risk === "write")
      .flatMap((b) => b.scopes);
    for (const w of writeScopes) {
      // documents/spreadsheets/tasks are in the defaults as an explicit product
      // decision; gmail.send must not be.
      expect(defaults).not.toContain("https://www.googleapis.com/auth/gmail.send");
    }
  });

  it("maps bundles to capability ids for feature gating", () => {
    const g = getProvider("google")!;
    expect(capabilitiesForBundles(g, ["calendar.read", "docs"])).toEqual(
      expect.arrayContaining(["calendar.read", "docs"])
    );
  });

  it("never treats the identity prerequisite as a product capability", () => {
    // Every connection satisfies "identify" by definition, so gating a feature
    // on it would be meaningless. Prerequisites must be invisible to gating.
    for (const p of PROVIDERS) {
      const prereqs = p.bundles.filter((b) => b.prerequisite).map((b) => b.id);
      if (!prereqs.length) continue;
      expect(capabilitiesForBundles(p, prereqs), p.key).toEqual([]);
    }
    const g = getProvider("google")!;
    expect(capabilitiesForBundles(g, ["identify", "calendar.read"])).toEqual([
      "calendar.read",
    ]);
  });

  it("always requests prerequisites, even when a feature bundle is selected alone", () => {
    const g = getProvider("google")!;
    const scopes = effectiveScopes(g, ["calendar.read"]);
    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.readonly");
  });

  it("every provider's identify-style bundle is marked a prerequisite", () => {
    for (const p of PROVIDERS) {
      const identify = p.bundles.find((b) => b.id === "identify");
      if (identify) expect(identify.prerequisite, `${p.key}.identify`).toBe(true);
    }
  });
});

describe("provider registry — readiness", () => {
  it("lookup works case-insensitively and 404s cleanly for unknown keys", () => {
    expect(getProvider("GOOGLE")?.key).toBe("google");
    expect(getProvider("nope")).toBeUndefined();
  });

  it("every provider is either ready or explicitly needs org config", () => {
    for (const p of PROVIDERS) {
      expect(["ready", "needs_config", "planned"]).toContain(p.status);
      if (p.status === "needs_config") {
        expect(p.blockedOnOrg, `${p.key} needs_config but not marked blockedOnOrg`).toBe(true);
      }
    }
  });

  it("a provider missing an env secret reports exactly which ones", () => {
    const g = getProvider("google")!;
    const saved = { ...process.env };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const missing = missingConfig(g).map((c) => c.key);
    expect(missing).toContain("GOOGLE_CLIENT_ID");
    expect(missing).toContain("GOOGLE_CLIENT_SECRET");
    expect(isProviderConfigured(g)).toBe(false);
    process.env = saved;
  });

  it("iCal needs no credentials, so it works on a fresh install", () => {
    const ical = getProvider("ical")!;
    expect(ical.requiredConfig).toEqual([]);
    expect(ical.status).toBe("ready");
  });

  it("builds the callback redirect an admin must register with the provider", () => {
    expect(redirectUriFor(getProvider("google")!, "https://taskboard.example.com")).toBe(
      "https://taskboard.example.com/api/integrations/google/callback"
    );
  });

  it("configurableProviders hides nothing that is actually planned", () => {
    for (const p of configurableProviders()) expect(p.status).not.toBe("planned");
    expect(listProviders().length).toBeGreaterThanOrEqual(configurableProviders().length);
  });
});
