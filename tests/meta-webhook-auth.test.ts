import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "crypto";
import { verifyMetaSignature } from "@/lib/meta-webhook-auth";

const SECRET = "app-secret-123";
const BODY = JSON.stringify({ entry: [{ changes: [{ value: { leadgen_id: "1" } }] }] });

const sign = (body: string, secret = SECRET) =>
  "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

afterEach(() => {
  delete process.env.META_APP_SECRET;
});

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed payload", () => {
    expect(verifyMetaSignature(BODY, sign(BODY), SECRET).ok).toBe(true);
  });

  it("rejects a payload signed with a different secret", () => {
    expect(verifyMetaSignature(BODY, sign(BODY, "wrong"), SECRET).ok).toBe(false);
  });

  it("rejects a modified body carrying the original signature", () => {
    const sig = sign(BODY);
    expect(verifyMetaSignature(BODY.replace('"1"', '"2"'), sig, SECRET).ok).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature(BODY, null, SECRET).ok).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyMetaSignature(BODY, "", SECRET).ok).toBe(false);
  });

  it("FAILS CLOSED when no app secret is configured", () => {
    // The regression: this used to return ok:true, which let anyone POST
    // forged leads and run employee commands through the WhatsApp webhook.
    const r = verifyMetaSignature(BODY, sign(BODY), null);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("META_APP_SECRET");
  });

  it("falls back to the environment when no resolved secret is passed", () => {
    process.env.META_APP_SECRET = SECRET;
    expect(verifyMetaSignature(BODY, sign(BODY)).ok).toBe(true);
  });

  it("still fails closed when the environment has no secret either", () => {
    expect(verifyMetaSignature(BODY, sign(BODY)).ok).toBe(false);
  });
});
