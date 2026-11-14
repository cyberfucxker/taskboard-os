import { describe, it, expect, beforeAll } from "vitest";

// A fixed key so the suite is deterministic; the module reads env at call time.
beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

import {
  encryptSecret,
  decryptSecret,
  readSecret,
  isEncrypted,
  aadFor,
  secretFingerprint,
  maskSecret,
} from "@/lib/integrations/vault";

const AAD_ALICE = aadFor("google", "emp-alice");
const AAD_BOB = aadFor("google", "emp-bob");

describe("integration vault — round trip", () => {
  it("returns the original secret", () => {
    const token = "ya29.a0AfH6SMBexampledeadbeef";
    expect(decryptSecret(encryptSecret(token, AAD_ALICE), AAD_ALICE)).toBe(token);
  });

  it("handles unicode, long values and empty-ish edge cases", () => {
    for (const v of ["a", "🔐 token with emoji", "x".repeat(8000), ' quote " and \\ backslash']) {
      expect(decryptSecret(encryptSecret(v, AAD_ALICE), AAD_ALICE)).toBe(v);
    }
  });

  it("refuses to encrypt an empty string rather than storing a useless row", () => {
    expect(() => encryptSecret("", AAD_ALICE)).toThrow();
  });

  it("produces different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-secret", AAD_ALICE);
    const b = encryptSecret("same-secret", AAD_ALICE);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, AAD_ALICE)).toBe(decryptSecret(b, AAD_ALICE));
  });

  it("never contains the plaintext", () => {
    const token = "SUPER-SENSITIVE-REFRESH-TOKEN";
    expect(encryptSecret(token, AAD_ALICE)).not.toContain(token);
  });
});

describe("integration vault — the attacks it must stop", () => {
  it("refuses to decrypt a token copied from another employee's row", () => {
    const aliceToken = encryptSecret("alice-refresh-token", AAD_ALICE);
    // The exact attack: an attacker with write access swaps a ciphertext into
    // another employee's row. AAD must make this fail loudly, not authenticate.
    expect(() => decryptSecret(aliceToken, AAD_BOB)).toThrow();
  });

  it("refuses a token moved to a different provider", () => {
    const g = encryptSecret("token", aadFor("google", "emp-alice"));
    expect(() => decryptSecret(g, aadFor("zoom", "emp-alice"))).toThrow();
  });

  it("detects tampering with the ciphertext", () => {
    const env = encryptSecret("original", AAD_ALICE);
    const [v, iv, tag, ct] = env.split(".");
    const bytes = Buffer.from(ct, "base64");
    bytes[0] ^= 0xff; // flip one bit
    expect(() => decryptSecret(`${v}.${iv}.${tag}.${bytes.toString("base64")}`, AAD_ALICE)).toThrow();
  });

  it("detects a swapped authentication tag", () => {
    const env = encryptSecret("original", AAD_ALICE);
    const [v, iv, tag, ct] = env.split(".");
    const badTag = Buffer.from(tag, "base64");
    badTag[0] ^= 0xff;
    expect(() => decryptSecret(`${v}.${iv}.${badTag.toString("base64")}.${ct}`, AAD_ALICE)).toThrow();
  });

  it("rejects values that are not vault envelopes", () => {
    expect(() => decryptSecret("just-a-plain-string", AAD_ALICE)).toThrow();
    expect(() => decryptSecret("v2.aaa.bbb.ccc", AAD_ALICE)).toThrow();
  });
});

describe("integration vault — legacy rows and helpers", () => {
  it("passes pre-vault plaintext through readSecret so old rows keep working", () => {
    expect(readSecret("legacy-plaintext-token", AAD_ALICE)).toBe("legacy-plaintext-token");
  });

  it("decrypts vault rows through readSecret", () => {
    const env = encryptSecret("modern", AAD_ALICE);
    expect(readSecret(env, AAD_ALICE)).toBe("modern");
  });

  it("treats null and empty as 'not connected'", () => {
    expect(readSecret(null, AAD_ALICE)).toBeNull();
    expect(readSecret("", AAD_ALICE)).toBeNull();
  });

  it("isEncrypted distinguishes envelope from legacy plaintext", () => {
    expect(isEncrypted(encryptSecret("x", AAD_ALICE))).toBe(true);
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });

  it("fingerprints are stable, non-reversible and identical for equal input", () => {
    const a = secretFingerprint("token");
    const b = secretFingerprint("token");
    expect(a).toBe(b);
    expect(a).not.toContain("token");
    expect(a).toHaveLength(12);
    expect(secretFingerprint("other")).not.toBe(a);
  });

  it("masks secrets for display without leaking them", () => {
    const m = maskSecret("refresh-token-value");
    expect(m).toMatch(/^••••••••[0-9a-f]{12}$/);
    expect(m).not.toContain("refresh-token");
    expect(maskSecret(null)).toBe("—");
  });
});

describe("integration vault — key handling", () => {
  it("rejects a mis-sized explicit key instead of silently weakening crypto", () => {
    const original = process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("x", AAD_ALICE)).toThrow(/32 bytes/);
    process.env.INTEGRATION_ENCRYPTION_KEY = original;
  });

  it("falls back to NEXTAUTH_SECRET when no dedicated key is set", () => {
    const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    const originalSecret = process.env.NEXTAUTH_SECRET;
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.NEXTAUTH_SECRET = "a-test-only-secret-value";
    const env = encryptSecret("derived", AAD_ALICE);
    expect(decryptSecret(env, AAD_ALICE)).toBe("derived");
    process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
    process.env.NEXTAUTH_SECRET = originalSecret;
  });
});
