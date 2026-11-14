import { describe, it, expect } from "vitest";
import { parseCsv, parseDelimited, detectDelimiter, stripBom } from "@/lib/leads/csv";

describe("detectDelimiter", () => {
  it("finds commas in a normal export", () => {
    expect(detectDelimiter("Name,Phone\nA,1")).toBe(",");
  });
  it("handles semicolon exports from a European locale", () => {
    expect(detectDelimiter("Name;Phone\nA;1")).toBe(";");
  });
  it("handles tab-separated files", () => {
    expect(detectDelimiter("Name\tPhone\nA\t1")).toBe("\t");
  });
  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('Name,Notes\nA,"x, y, z"')).toBe(",");
  });
});

describe("stripBom", () => {
  it("removes the Excel BOM", () => {
    expect(stripBom("\uFEFFName,Phone")).toBe("Name,Phone");
  });
  it("leaves normal text alone", () => {
    expect(stripBom("Name")).toBe("Name");
  });
});

describe("parseCsv", () => {
  it("reads a simple file", () => {
    const rows = parseCsv("Name,Phone\nRahul,9999988888");
    expect(rows).toEqual([{ Name: "Robin", Phone: "9999988888" }]);
  });

  it("keeps commas inside quoted fields", () => {
    const rows = parseCsv('Name,Notes\n"Robin, Lane","Called, then emailed"');
    expect(rows[0].Name).toBe("Robin, Lane");
    expect(rows[0].Notes).toBe("Called, then emailed");
  });

  it("unescapes doubled quotes", () => {
    const rows = parseCsv('Name,Notes\nRahul,"He said ""call me"""');
    expect(rows[0].Notes).toBe('He said "call me"');
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseCsv('Name,Notes\nRahul,"line one\nline two"');
    expect(rows).toHaveLength(1);
    expect(rows[0].Notes).toBe("line one\nline two");
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("Name,Phone\r\nRahul,9999988888\r\n");
    expect(rows).toEqual([{ Name: "Robin", Phone: "9999988888" }]);
  });

  it("strips a BOM off the first header", () => {
    const rows = parseCsv("\uFEFFName,Phone\nRahul,9999988888");
    expect(Object.keys(rows[0])[0]).toBe("Name");
  });

  it("pads short rows instead of dropping columns", () => {
    const rows = parseCsv("Name,Phone,Email\nRahul,9999988888");
    expect(rows[0].Email).toBe("");
  });

  it("names blank headers so nothing is silently lost", () => {
    const rows = parseCsv("Name,,Phone\nRahul,x,9999988888");
    expect(Object.keys(rows[0])).toContain("Column 2");
  });

  it("skips fully blank lines", () => {
    const rows = parseCsv("Name,Phone\n\nRahul,9999988888\n\n");
    expect(rows).toHaveLength(1);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("parseDelimited with an explicit delimiter", () => {
  it("reads a semicolon file when told to", () => {
    const rows = parseDelimited("Name;Phone\nRahul;9999988888", ";");
    expect(rows).toEqual([{ Name: "Robin", Phone: "9999988888" }]);
  });
});
