import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

/**
 * Tests for the Meta lead webhook — signature checking, idempotency, form routing, Graph-down
 * stub lead. Tests run against the Next.js route (src/app/api/webhooks/meta-leads/route.ts)
 * which after T7 uses CrmSourceConnection-based auth and T7 field map.
 */

const { prismaMock, fetchLeadData, fetchOptionLabels, applyT7FieldMap, buildMetaNotesBlock, ensureCustomFields, saveCustomValues, getFormName, fireTrigger, placementFor, verifyMetaSignature } = vi.hoisted(() => ({
  prismaMock: {
    crmLead: { findFirst: vi.fn(), create: vi.fn() },
    crmSourceConnection: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    crmIntegrationActivity: { create: vi.fn().mockResolvedValue({}) },
    crmActivity: { create: vi.fn() },
    crmNote: { create: vi.fn() },
    crmCustomField: { upsert: vi.fn() },
    crmCustomValue: { upsert: vi.fn() },
  },
  fetchLeadData: vi.fn(),
  fetchOptionLabels: vi.fn().mockResolvedValue({}),
  applyT7FieldMap: vi.fn(),
  buildMetaNotesBlock: vi.fn().mockReturnValue("Meta form: FORM_A\n---\nFull Name: Robin Stone"),
  ensureCustomFields: vi.fn().mockResolvedValue(new Map()),
  saveCustomValues: vi.fn().mockResolvedValue(0),
  getFormName: vi.fn().mockResolvedValue("Test Form"),
  fireTrigger: vi.fn().mockResolvedValue(undefined),
  placementFor: vi.fn(),
  verifyMetaSignature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

vi.mock("@/lib/metaService", () => ({
  fetchLeadData: (...a: unknown[]) => fetchLeadData(...a),
}));

vi.mock("@/crm-server/services/crypto", () => ({
  decrypt: (v: string) => v,
}));

vi.mock("@/crm-server/services/leadFieldMapping", () => ({
  fetchOptionLabels: (...a: unknown[]) => fetchOptionLabels(...a),
  applyT7FieldMap: (...a: unknown[]) => applyT7FieldMap(...a),
  buildMetaNotesBlock: (...a: unknown[]) => buildMetaNotesBlock(...a),
  ensureCustomFields: (...a: unknown[]) => ensureCustomFields(...a),
  saveCustomValues: (...a: unknown[]) => saveCustomValues(...a),
  isHiringForm: (form?: string | null) => /hiring/i.test(form ?? ""),
}));

vi.mock("@/crm-server/services/metaService", () => ({
  getFormName: (...a: unknown[]) => getFormName(...a),
}));

vi.mock("@/crm-server/services/hiringPipeline", () => ({
  getOrCreateHiringPipeline: vi.fn().mockResolvedValue({ pipelineId: "hiring-pipe", pipelineStageId: "hiring-stage" }),
}));

vi.mock("@/crm-server/services/automationEngine", () => ({
  fireTrigger: (...a: unknown[]) => fireTrigger(...a),
}));

vi.mock("@/lib/crm/bridge", () => ({
  placementFor: (...a: unknown[]) => placementFor(...a),
  crmSourceFor: (s: string) => (s === "META_LEAD_ADS" ? "meta" : s),
}));

vi.mock("@/lib/meta-webhook-auth", () => ({
  verifyMetaSignature: (...a: unknown[]) => verifyMetaSignature(...a),
}));

import { GET, POST } from "@/app/api/webhooks/meta-leads/route";

const APP_SECRET = "test-app-secret";
const PIPELINE_ID = "pipe_1";
const STAGE_ID = "stage_1";

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
}

function leadgenBody(leadgenId = "4821", formId = "FORM_A", pageId = "PAGE_1") {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        changes: [
          { field: "leadgen", value: { leadgen_id: leadgenId, form_id: formId, page_id: pageId } },
        ],
      },
    ],
  });
}

function post(body: string, signature?: string) {
  return POST(
    new Request("https://taskboard.example.com/api/webhooks/meta-leads", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": signature ?? sign(body) },
    })
  );
}

const defaultConnection = {
  id: "conn_test_1",
  source: "meta",
  metaPageId: "PAGE_1",
  metaAppSecret: APP_SECRET,
  metaPageAccessToken: "page-token",
  active: true,
};

const defaultT7Result = {
  lead: {
    firstName: "Robin",
    lastName: "Stone",
    email: "robin@example.com",
    phone: "+91 99999 88888",
    company: "Acme",
    city: "Delhi",
    jobTitle: "Founder",
    services: [],
  },
  custom: {},
  hiringCustom: {},
  isHiring: false,
  unmapped: {},
};

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.crmSourceConnection.findFirst.mockResolvedValue(defaultConnection);
  prismaMock.crmLead.findFirst.mockResolvedValue(null);
  prismaMock.crmLead.create.mockImplementation(async ({ data }: any) => ({ id: "lead_1", ...data }));
  prismaMock.crmActivity.create.mockResolvedValue({ id: "act_1" });
  prismaMock.crmNote.create.mockResolvedValue({ id: "note_1" });

  fetchLeadData.mockResolvedValue({
    id: "4821",
    form_id: "FORM_A",
    campaign_name: "Test Campaign",
    ad_name: "Test Ad",
    adset_name: "Test Adset",
    platform: "facebook",
    field_data: [{ name: "FULL_NAME", values: ["Robin Stone"] }],
  });

  applyT7FieldMap.mockReturnValue(defaultT7Result);

  verifyMetaSignature.mockReturnValue({ ok: true });

  placementFor.mockResolvedValue({
    pipelineId: PIPELINE_ID,
    pipelineStageId: STAGE_ID,
    status: "new",
  });
});

describe("GET verification handshake", () => {
  it("echoes the challenge when the verify token matches", async () => {
    process.env.META_VERIFY_TOKEN = "vt-123";
    const res = await GET(
      new Request("https://x/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=vt-123&hub.challenge=42")
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("42");
    delete process.env.META_VERIFY_TOKEN;
  });

  it("refuses a wrong verify token", async () => {
    process.env.META_VERIFY_TOKEN = "vt-123";
    const res = await GET(
      new Request("https://x/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42")
    );
    expect(res.status).toBe(403);
    delete process.env.META_VERIFY_TOKEN;
  });

  it("refuses when no verify token is configured at all", async () => {
    delete process.env.META_VERIFY_TOKEN;
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const res = await GET(
      new Request("https://x/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=42")
    );
    expect(res.status).toBe(403);
  });
});

describe("POST signature enforcement", () => {
  it("rejects an invalid signature", async () => {
    verifyMetaSignature.mockReturnValue({ ok: false, reason: "bad sig" });
    const body = leadgenBody();
    const res = await post(body, "sha256=badvalue");
    expect(res.status).toBe(401);
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });

  it("skips processing when no connection found for page", async () => {
    prismaMock.crmSourceConnection.findFirst.mockResolvedValue(null);
    const res = await post(leadgenBody());
    expect(res.status).toBe(200);
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });
});

describe("ingestion", () => {
  it("creates an enriched lead with T7 field map", async () => {
    const res = await post(leadgenBody());
    expect(res.status).toBe(200);

    expect(fetchLeadData).toHaveBeenCalledWith("4821", "page-token");
    expect(applyT7FieldMap).toHaveBeenCalled();

    const created = prismaMock.crmLead.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      firstName: "Robin",
      lastName: "Stone",
      email: "robin@example.com",
      phone: "+91 99999 88888",
      source: "meta",
    });
    expect(created.externalLeadId).toBe("4821");
    expect(prismaMock.crmNote.create).toHaveBeenCalledTimes(1);
    expect(fireTrigger).toHaveBeenCalledWith("lead_created", "lead_1");
  });

  it("skips a leadgen_id it has already ingested", async () => {
    prismaMock.crmLead.findFirst.mockResolvedValue({ id: "lead_existing" });
    const res = await post(leadgenBody());
    expect(res.status).toBe(200);
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });

  it("looks the duplicate up by externalLeadId", async () => {
    await post(leadgenBody("9876"));
    expect(prismaMock.crmLead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalLeadId: "9876" } })
    );
  });

  it("ignores changes that are not leadgen", async () => {
    const body = JSON.stringify({ entry: [{ id: "PAGE_1", changes: [{ field: "page", value: {} }] }] });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });

  it("creates stub lead when Graph is down", async () => {
    fetchLeadData.mockRejectedValue(new Error("graph 503"));
    const res = await post(leadgenBody());
    expect(res.status).toBe(200);
    const created = prismaMock.crmLead.create.mock.calls[0][0].data;
    expect((created.adDetail as any).importError).toBe(true);
    expect((created.adDetail as any).errorMessage).toContain("graph 503");
    expect(created.firstName).toContain("Meta Lead");
  });

  it("stores full form answers as a note", async () => {
    await post(leadgenBody());
    const noteCall = prismaMock.crmNote.create.mock.calls[0][0].data;
    expect(noteCall.userId).toBe("system");
    expect(noteCall.userName).toBe("Meta Lead Ads");
    expect(typeof noteCall.body).toBe("string");
    expect(noteCall.body.length).toBeGreaterThan(0);
  });

  it("sets otherSource to platform · campaign · form", async () => {
    await post(leadgenBody());
    const created = prismaMock.crmLead.create.mock.calls[0][0].data;
    expect(created.otherSource).toContain("Facebook");
    expect(created.otherSource).toContain("Test Campaign");
    expect(created.otherSource).toContain("Test Form");
  });

  it("sets utmContent and utmTerm from ad and adset names", async () => {
    await post(leadgenBody());
    const created = prismaMock.crmLead.create.mock.calls[0][0].data;
    expect(created.utmContent).toBe("Test Ad");
    expect(created.utmTerm).toBe("Test Adset");
  });

  it("stores full adDetail including platform and leadgenId", async () => {
    await post(leadgenBody());
    const created = prismaMock.crmLead.create.mock.calls[0][0].data;
    const ad = created.adDetail as Record<string, unknown>;
    expect(ad.platform).toBe("facebook");
    expect(ad.leadgenId).toBe("4821");
    expect(ad.pageId).toBe("PAGE_1");
    expect(ad.formId).toBe("FORM_A");
  });
});
