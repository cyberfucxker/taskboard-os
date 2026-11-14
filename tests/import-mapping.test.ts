import { describe, it, expect } from "vitest";
import { buildColumnMap, hasIdentityColumn } from "@/lib/leads/normalize";

describe("hasIdentityColumn", () => {
  it("accepts a real-world header that auto-maps to name", () => {
    // Regression: the guard used to read mapping.name, which is undefined for
    // a header called "Full Name", so every genuine CSV was rejected.
    const { mapping } = buildColumnMap(["Full Name", "Mobile Number"]);
    expect(mapping).toEqual({ "Full Name": "name", "Mobile Number": "phone" });
    expect(hasIdentityColumn(mapping)).toBe(true);
  });

  it("accepts identity by email only", () => {
    const { mapping } = buildColumnMap(["E-mail Address"]);
    expect(hasIdentityColumn(mapping)).toBe(true);
  });

  it("accepts identity by phone only", () => {
    const { mapping } = buildColumnMap(["Mobile Number"]);
    expect(hasIdentityColumn(mapping)).toBe(true);
  });

  it("rejects a file with no identity column", () => {
    const { mapping } = buildColumnMap(["Notes", "City"]);
    expect(hasIdentityColumn(mapping)).toBe(false);
  });

  it("rejects an empty map", () => {
    expect(hasIdentityColumn({})).toBe(false);
  });

  it("respects an explicit user mapping over the guess", () => {
    const { mapping } = buildColumnMap(["Column A"], { "Column A": "email" });
    expect(hasIdentityColumn(mapping)).toBe(true);
  });
});
