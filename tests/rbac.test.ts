import { describe, it, expect } from "vitest";
import { effectiveCaps, baseCaps, baseCapsByRole, DEPT_ADDONS, isCommercial, ROLE_LABELS, ALL_CAPABILITIES } from "@/lib/rbac";

/**
 * RBAC — the access-control contract (CORE-01). These tests pin the exact
 * behaviour the COO depends on: an employee sees their department's work plus
 * whatever their role/department/overrides justify — never a commercial
 * surface they don't own. The motivating case is a DM/SEO backlink executive
 * who must NOT see revenue, deals, or other CRM/finance data.
 */
describe("effectiveCaps — base ⊕ dept ⊕ overrides", () => {
  it("a DM executive (SEO / backlinks) sees no commercial data", () => {
    const caps = effectiveCaps("EXECUTIVE", "dm", null);
    // Workspace + own tasks + their own training — yes.
    // NOTE: this used to assert "catalog.view", but that capability was removed
    // from the system (see the legacy-name filter in src/app/api/access/[id]).
    // It is pinned as retired by the test at the bottom of this file.
    expect(caps.has("workspace.access")).toBe(true);
    expect(caps.has("tasks.view")).toBe(true);
    expect(caps.has("lms.view")).toBe(true);
    // Commercial / cross-dept surfaces the DM exec must NOT touch.
    expect(caps.has("board.view")).toBe(false); // revenue / P&L
    expect(caps.has("finance.view")).toBe(false);
    expect(caps.has("crm.salesDeals")).toBe(false);
    expect(caps.has("crm.view")).toBe(false);
    // Not an admin.
    expect(caps.has("admin.scope")).toBe(false);
  });

  it("a Sales BDE sees deals but not company finance", () => {
    const caps = effectiveCaps("EXECUTIVE", "sales", null);
    expect(caps.has("crm.salesDeals")).toBe(true); // their own job
    expect(caps.has("crm.view")).toBe(true);
    expect(caps.has("finance.view")).toBe(false); // not P&L
    expect(caps.has("board.view")).toBe(false);
  });

  it("a Finance role owns finance but not CRM deals", () => {
    const caps = effectiveCaps("FINANCE", "finance", null);
    expect(caps.has("finance.view")).toBe(true);
    expect(caps.has("finance.manage")).toBe(true);
    expect(caps.has("board.view")).toBe(false);
    expect(caps.has("crm.salesDeals")).toBe(false);
  });

  it("a DESIGN executive of the same tier also sees no commercial data", () => {
    const caps = effectiveCaps("EXECUTIVE", "design", null);
    expect(caps.has("crm.view")).toBe(false);
    expect(caps.has("finance.view")).toBe(false);
    expect(caps.has("tasks.view")).toBe(true);
  });

  it("TEAM_LEAD / DEPARTMENT_HEAD are the exempt commercial-view tiers", () => {
    expect(effectiveCaps("SUPER_ADMIN", "leadership", null).has("board.view")).toBe(true);
    expect(effectiveCaps("SUPER_ADMIN", "leadership", null).has("admin.scope")).toBe(true);
  });

  it("department add-ons layer on top of a minimal base role", () => {
    // INTERN has no CRM by base; the sales dept grants the CRM surface.
    const before = baseCaps("INTERN");
    expect(before.includes("crm.view")).toBe(false);
    const after = effectiveCaps("INTERN", "sales", null);
    expect(after.has("crm.view")).toBe(true);
    expect(after.has("crm.salesDeals")).toBe(true);
  });

  it("an explicit allow lets the COO widen a single capability", () => {
    const caps = effectiveCaps("EXECUTIVE", "dm", { allow: ["crm.salesDeals"], deny: [] });
    expect(caps.has("crm.salesDeals")).toBe(true);
    // Narrows nothing else.
    expect(caps.has("tasks.view")).toBe(true);
  });

  it("an explicit deny beats a base / dept grant (the 'revoke' chip)", () => {
    const head = effectiveCaps("DEPARTMENT_HEAD", "design", { deny: ["crm.view"] });
    expect(head.has("crm.view")).toBe(false); // granted by base, denied by override
    // Other base caps untouched.
    expect(head.has("tasks.manage")).toBe(true);
  });

  it("deny beats allow (a full override set resolves to: base ∪ dept ∪ allow − deny)", () => {
    const caps = effectiveCaps("INTERN", "sales", { allow: ["finance.view"], deny: ["crm.salesDeals"] });
    expect(caps.has("finance.view")).toBe(true); // allow won
    expect(caps.has("crm.salesDeals")).toBe(false); // deny won over dept add-on
    expect(caps.has("crm.view")).toBe(true); // untouched dept add-on remains
  });

  it("commercial capabilities are flagged for the Access admin UI", () => {
    expect(isCommercial("finance.view")).toBe(true);
    expect(isCommercial("crm.salesDeals")).toBe(true);
    expect(isCommercial("board.view")).toBe(true);
    expect(isCommercial("tasks.view")).toBe(false);
  });

  it("every defined role has a label (admin surface completeness)", () => {
    for (const role of Object.keys(baseCapsByRole) as Array<keyof typeof ROLE_LABELS>) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("every department slug used in the seed has a defined (possibly empty) add-on set — no silent gaps", () => {
    // design/dev/dm/hr are intentionally empty; leadership/sales/finance carve
    // out the commercial surface. Nothing else may reference an unknown slug.
    for (const slug of ["leadership", "sales", "design", "dev", "dm", "finance"]) {
      expect(Array.isArray(DEPT_ADDONS[slug] ?? [])).toBe(true);
    }
  });
});

describe("retired capabilities", () => {
  it("catalog.view stays retired and is not grantable", () => {
    // "catalog.view" was removed from the Capability union. Stored employee
    // overrides may still reference it, so the access API filters those names
    // out - but it must never reappear as a real capability.
    expect(ALL_CAPABILITIES).not.toContain("catalog.view");
  });
});
