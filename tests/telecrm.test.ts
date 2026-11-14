import { describe, it, expect, vi, afterEach } from "vitest";
import { telecrmToRow, TeleCrmError, fetchLeadPage, nextCursorAfterRun } from "@/lib/leads/telecrm";

describe("telecrmToRow", () => {
  it("flattens the free-form fields map into a normal row", () => {
    const row = telecrmToRow({
      id: 42,
      created: "2024-03-05",
      status: 1,
      score: 75,
      fields: { first_name: "Robin", last_name: "Stone", email: "r@example.com" },
    });
    expect(row.first_name).toBe("Robin");
    expect(row["TeleCRM ID"]).toBe("42");
    expect(row["Created At"]).toBe("2024-03-05");
    expect(row.Score).toBe("75");
  });

  it("joins array values with commas", () => {
    const row = telecrmToRow({ fields: { tags: ["a", "b"] } });
    expect(row.tags).toBe("a, b");
  });

  it("pulls a label out of a nested option object", () => {
    const row = telecrmToRow({ fields: { status: { key: "1", value: "New" } } });
    expect(row.status).toBe("New");
  });

  it("skips null and empty values", () => {
    const row = telecrmToRow({ fields: { a: null, b: "", c: "keep" } });
    expect(row.a).toBeUndefined();
    expect(row.b).toBeUndefined();
    expect(row.c).toBe("keep");
  });

  it("survives a lead with no fields at all", () => {
    const row = telecrmToRow({ id: 1 });
    expect(row["TeleCRM ID"]).toBe("1");
  });
});

describe("fetchLeadPage", () => {
  const cfg = { enterpriseId: "123", token: "tok" };
  afterEach(() => vi.unstubAllGlobals());

  it("returns leads and total on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 1 }], total_count: 350 }),
    })));
    const res = await fetchLeadPage(cfg, 0);
    expect(res.leads).toHaveLength(1);
    expect(res.total).toBe(350);
  });

  it("explains that an Async token cannot read, on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorised",
    })));
    await expect(fetchLeadPage(cfg, 0)).rejects.toThrow(TeleCrmError);
    await expect(fetchLeadPage(cfg, 0)).rejects.toThrow(/Sync/);
  });

  it("sends the token in the Authorization header, not as a bearer", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    vi.stubGlobal("fetch", spy);
    await fetchLeadPage(cfg, 0);
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Authorization).toBe("tok");
    expect(init.headers.Authorization).not.toContain("Bearer");
  });

  it("tolerates a response with no data array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    const res = await fetchLeadPage(cfg, 0);
    expect(res.leads).toEqual([]);
    expect(res.total).toBeNull();
  });
});

describe("nextCursorAfterRun", () => {
  it("keeps a cursor when the page cap cut the run short", () => {
    // 250 leads read at 100/page means the next unread page is 2.
    expect(nextCursorAfterRun("maxPages", 250)).toBe("2");
  });

  it("clears the cursor after reaching the end of the list", () => {
    // A permanent high-water mark would skip leads added later if TeleCRM
    // returns newest-first.
    expect(nextCursorAfterRun("reachedEnd", 1000)).toBeNull();
  });

  it("clears the cursor on error (the error path holds startPage instead)", () => {
    expect(nextCursorAfterRun("error", 300)).toBeNull();
  });

  it("rounds a partial page down to the page it is reading", () => {
    expect(nextCursorAfterRun("maxPages", 0)).toBe("0");
    expect(nextCursorAfterRun("maxPages", 199)).toBe("1");
  });
});
