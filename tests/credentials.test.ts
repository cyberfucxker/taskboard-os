import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { disconnect } from "@/lib/integrations/oauth";

/**
 * Provider credential resolution.
 *
 * These are the tests that matter most for safety: an admin screen that writes
 * secrets is only trustworthy if (a) secrets come back encrypted, (b) they can
 * never be moved between providers, and (c) the environment still wins over a
 * stale database row. Prisma is mocked because the real client would open a
 * socket; the assertions are about the logic, not the ORM.
 */

// vi.mock is hoisted above these declarations, so the handles have to be
// hoisted with them or the factory runs before they exist.
// vi.mock is hoisted above these declarations, so the fake row store has to be
// hoisted with it. It is a two-method in-memory stand-in for the real client:
// a write must be visible to a later read, otherwise "save then resolve" cannot
// be tested at all.
const { rows, upsert, findUnique } = vi.hoisted(() => {
  const rows = new Map<string, any>();
  return {
    rows,
    findUnique: vi.fn(async ({ where }: any) => {
      const row = rows.get(where.provider);
      return row ? { credentialsJson: row.credentialsJson } : null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = rows.get(where.provider);
      const next = existing
        ? { ...existing, ...update }
        : { ...create, ...update };
      rows.set(where.provider, next);
      return next;
    }),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    systemIntegrationConfig: {
      findUnique,
      upsert,
    },
    // Overridden per-test by the casing block below; these are just enough for
    // the module to load.
    employeeIntegration: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async (args: any) => args),
    },
    activityLog: {
      create: vi.fn(async (args: any) => args),
    },
  },
}));

import { prisma } from "@/lib/db";

beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

import {
  resolveConfigValue,
  hasConfigValue,
  missingConfigFor,
  missingOptionalFor,
  isProviderConfiguredFor,
  providerConfigStatus,
  saveProviderCredentials,
  invalidateCredentialCache,
} from "@/lib/integrations/credentials";
import { getProvider } from "@/lib/integrations/registry";
import { decryptSecret, isEncrypted, aadFor } from "@/lib/integrations/vault";

const GOOGLE_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_WORKSPACE_DOMAIN"] as const;

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  for (const k of GOOGLE_ENV) delete process.env[k];
  invalidateCredentialCache();
  rows.clear();
  findUnique.mockClear();
  upsert.mockClear();
});

afterEach(() => {
  process.env = savedEnv;
  invalidateCredentialCache();
});

function withEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  invalidateCredentialCache();
}

describe("credential resolution — env wins when set", () => {
  it("reads a value straight from the environment", async () => {
    withEnv({ GOOGLE_CLIENT_ID: "env-id.apps.googleusercontent.com" });
    expect(await resolveConfigValue("google", "GOOGLE_CLIENT_ID")).toBe("env-id.apps.googleusercontent.com");
    expect(await hasConfigValue("google", "GOOGLE_CLIENT_ID")).toBe(true);
  });

  it("does not let a stale database row override the environment", async () => {
    await saveProviderCredentials("google", { GOOGLE_CLIENT_ID: "db-id" });
    withEnv({ GOOGLE_CLIENT_ID: "env-id" });
    expect(await resolveConfigValue("google", "GOOGLE_CLIENT_ID")).toBe("env-id");
  });
});

describe("credential resolution — database fallback", () => {
  it("returns a value saved through the admin path", async () => {
    await saveProviderCredentials("google", { GOOGLE_CLIENT_ID: "db-id" });
    expect(await resolveConfigValue("google", "GOOGLE_CLIENT_ID")).toBe("db-id");
  });

  it("treats a blank input as a clear, not an empty stored value", async () => {
    await saveProviderCredentials("google", { GOOGLE_CLIENT_ID: "db-id" });
    const cleared = await saveProviderCredentials("google", { GOOGLE_CLIENT_ID: "" });
    expect(cleared.cleared).toContain("GOOGLE_CLIENT_ID");
    expect(await resolveConfigValue("google", "GOOGLE_CLIENT_ID")).toBeNull();
  });

  it("ignores a key the registry does not declare", async () => {
    const r = await saveProviderCredentials("google", { NOT_A_REAL_KEY: "x" });
    expect(r.saved).toEqual([]);
  });

  it("rejects an unknown provider", async () => {
    await expect(saveProviderCredentials("nope", { GOOGLE_CLIENT_ID: "x" })).rejects.toThrow();
  });
});

describe("credential storage — encrypted and bound to the provider", () => {
  it("stores a secret as a vault envelope, not plaintext", async () => {
    await saveProviderCredentials("google", { GOOGLE_CLIENT_SECRET: "GOCSPX-super-secret" });
    const stored = rows.get("google").credentialsJson.GOOGLE_CLIENT_SECRET;
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("super-secret");
  });

  it("keeps a non-secret readable so an admin can see which app is configured", async () => {
    await saveProviderCredentials("google", { GOOGLE_CLIENT_ID: "12345.apps.googleusercontent.com" });
    expect(rows.get("google").credentialsJson.GOOGLE_CLIENT_ID).toBe(
      "12345.apps.googleusercontent.com"
    );
  });

  it("cannot be read after the row is moved to another provider", async () => {
    await saveProviderCredentials("google", { GOOGLE_CLIENT_SECRET: "s3cret" });
    const stored = rows.get("google").credentialsJson.GOOGLE_CLIENT_SECRET;
    expect(() => decryptSecret(stored, aadFor("zoom", "org"))).toThrow();
    expect(decryptSecret(stored, aadFor("google", "org"))).toBe("s3cret");
  });

  it("treats an unreadable envelope as unset instead of crashing", async () => {
    // A row restored from a backup taken before a key rotation.
    rows.set("google", { credentialsJson: { GOOGLE_CLIENT_ID: "v1.AAAA.BBBB.CCCC" } });
    invalidateCredentialCache("google");
    expect(await resolveConfigValue("google", "GOOGLE_CLIENT_ID")).toBeNull();
  });
});

describe("configured checks follow both sources", () => {
  it("reports Google unconfigured when nothing is set anywhere", async () => {
    const g = getProvider("google")!;
    const missing = (await missingConfigFor(g)).map((c) => c.key);
    expect(missing).toContain("GOOGLE_CLIENT_ID");
    expect(missing).toContain("GOOGLE_CLIENT_SECRET");
    expect(await isProviderConfiguredFor(g)).toBe(false);
  });

  it("reports Google configured once the database has both keys", async () => {
    await saveProviderCredentials("google", {
      GOOGLE_CLIENT_ID: "db-id",
      GOOGLE_CLIENT_SECRET: "db-secret",
    });
    expect(await isProviderConfiguredFor(getProvider("google")!)).toBe(true);
  });

  it("does not let a missing OPTIONAL key block a provider", async () => {
    await saveProviderCredentials("google", {
      GOOGLE_CLIENT_ID: "db-id",
      GOOGLE_CLIENT_SECRET: "db-secret",
    });
    const g = getProvider("google")!;
    expect((await missingConfigFor(g)).length).toBe(0);
    expect(await isProviderConfiguredFor(g)).toBe(true);
  });

  it("iCal needs no credentials and is always configured", async () => {
    expect(await isProviderConfiguredFor(getProvider("ical")!)).toBe(true);
  });
});

describe("status output never contains a full secret", () => {
  it("reports set/source/masked hint only", async () => {
    await saveProviderCredentials("google", {
      GOOGLE_CLIENT_ID: "12345.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-abcd1234wxyz",
    });

    const status = await providerConfigStatus();
    const google = status.find((p) => p.provider === "google")!;
    const secretKey = google.keys.find((k) => k.key === "GOOGLE_CLIENT_SECRET")!;
    const idKey = google.keys.find((k) => k.key === "GOOGLE_CLIENT_ID")!;

    expect(secretKey.set).toBe(true);
    expect(secretKey.source).toBe("database");
    expect(secretKey.hint).toMatch(/wxyz$/);
    expect(secretKey.hint).not.toContain("GOCSPX");

    // Non-secret values are readable on purpose.
    expect(idKey.hint).toContain("12345");

    const serialised = JSON.stringify(status);
    expect(serialised).not.toContain("GOCSPX-abcd1234wxyz");
    expect(serialised).not.toContain("v1."); // no raw vault envelopes leak either
  });

  it("marks a key supplied by the environment as env-sourced", async () => {
    withEnv({ GOOGLE_CLIENT_ID: "env-id" });
    const status = await providerConfigStatus();
    const google = status.find((p) => p.provider === "google")!;
    const idKey = google.keys.find((k) => k.key === "GOOGLE_CLIENT_ID")!;
    expect(idKey.source).toBe("env");
    expect(google.configured).toBe(false); // the secret is still missing
  });
});


// ─── Regressions found while deploying the hub ────────────────────────────────
// The registry keys are lowercase, but the older settings form and its API have
// always upper-cased the provider before writing it. `connectionsFor` folded
// case when reading, so the hub showed those rows as connected while
// disconnect and token refresh looked them up by exact lowercase key and
// silently matched nothing. These tests pin the fix.

describe("EmployeeIntegration provider-name casing", () => {
  const EMPLOYEE = "emp-casing-1";
  let store: { row?: any };

  beforeEach(() => {
    store = {};
    (prisma as any).employeeIntegration.findUnique = vi.fn(({ where }: any) =>
      store.row &&
      store.row.employeeId === where.employeeId_provider.employeeId &&
      store.row.provider === where.employeeId_provider.provider
        ? Promise.resolve({ ...store.row })
        : Promise.resolve(null)
    );
    (prisma as any).employeeIntegration.findFirst = vi.fn(({ where }: any) => {
      if (!store.row || store.row.employeeId !== where.employeeId) return Promise.resolve(null);
      const want = where.provider.equals;
      const mode = where.provider.mode;
      const hit = mode === "insensitive" ? want.toLowerCase() === store.row.provider.toLowerCase() : want === store.row.provider;
      return Promise.resolve(hit ? { ...store.row } : null);
    });
    (prisma as any).employeeIntegration.update = vi.fn(({ where, data }: any) => {
      if (!store.row || store.row.id !== where.id) return Promise.reject(new Error("no such row"));
      store.row = { ...store.row, ...data };
      return Promise.resolve({ ...store.row });
    });
  });

  it("disconnects a row the old form stored as ICAL, not just ical", async () => {
    store.row = {
      id: "row-1",
      employeeId: EMPLOYEE,
      provider: "ICAL",
      icalUrl: "https://example.com/private.ics",
      personalMeetUrl: null,
      calendlyUrl: null,
      whatsappPhone: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      accountEmail: null,
      isActive: true,
      settings: {},
    };

    await disconnect(EMPLOYEE, "ical");

    expect(store.row.isActive).toBe(false);
    expect(store.row.settings.disconnectedAt).toEqual(expect.any(String));
  });

  it("clears a pasted iCal feed on disconnect — a private link is a credential", async () => {
    store.row = {
      id: "row-2",
      employeeId: EMPLOYEE,
      provider: "ICAL",
      icalUrl: "https://example.com/private.ics",
      personalMeetUrl: null,
      calendlyUrl: null,
      whatsappPhone: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      accountEmail: null,
      isActive: true,
      settings: {},
    };

    await disconnect(EMPLOYEE, "ical");

    expect(store.row.icalUrl).toBeNull();
  });

  it("clears a personal Meet link and a WhatsApp number too", async () => {
    store.row = {
      id: "row-3",
      employeeId: EMPLOYEE,
      provider: "GOOGLE",
      icalUrl: null,
      personalMeetUrl: "https://meet.google.com/abc-defg-hij",
      calendlyUrl: null,
      whatsappPhone: "+919999999999",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      accountEmail: null,
      isActive: true,
      settings: {},
    };

    await disconnect(EMPLOYEE, "google");

    expect(store.row.personalMeetUrl).toBeNull();
    expect(store.row.whatsappPhone).toBeNull();
    expect(store.row.isActive).toBe(false);
  });

  it("still disconnects a row the new engine wrote in lowercase", async () => {
    store.row = {
      id: "row-4",
      employeeId: EMPLOYEE,
      provider: "ical",
      icalUrl: "https://example.com/f.ics",
      personalMeetUrl: null,
      calendlyUrl: null,
      whatsappPhone: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      accountEmail: null,
      isActive: true,
      settings: {},
    };

    await disconnect(EMPLOYEE, "ical");

    expect(store.row.isActive).toBe(false);
  });

  it("does not throw when the employee has no such row", async () => {
    store.row = undefined;
    await expect(disconnect(EMPLOYEE, "ical")).resolves.toBeUndefined();
  });
});
