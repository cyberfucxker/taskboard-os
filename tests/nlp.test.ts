import { describe, it, expect } from "vitest";
import { parseQuickInput, detectEntity, dueOffsetDays, prettyDue } from "@/lib/nlp";

describe("parseQuickInput — @assignee #dept !priority ~due", () => {
  it("parses the full TaskBoard signature syntax", () => {
    const p = parseQuickInput("Ship NovaFit landing @sage #dev !P1 ~fri");
    expect(p.title).toBe("Ship NovaFit landing");
    expect(p.assignee).toBe("sage");
    expect(p.department).toBe("dev");
    expect(p.priority).toBe("P1");
    expect(p.due).toBe("fri");
  });

  it("returns defaults when no tokens are present", () => {
    const p = parseQuickInput("Just a plain title");
    expect(p.title).toBe("Just a plain title");
    expect(p.assignee).toBeNull();
    expect(p.department).toBeNull();
    expect(p.priority).toBe("P2");
    expect(p.due).toBeNull();
  });

  it("defaults priority to P2 for unknown ! values", () => {
    const p = parseQuickInput("Task !P9");
    expect(p.priority).toBe("P2");
  });

  it("handles each token independently and strips it from the title", () => {
    const p = parseQuickInput("Build report @riley");
    expect(p.title).toBe("Build report");
    expect(p.assignee).toBe("riley");

    const q = parseQuickInput("#design new poster");
    expect(q.title).toBe("new poster");
    expect(q.department).toBe("design");
  });

  it("keeps a leading artifact off the title when inline", () => {
    const p = parseQuickInput("!P0 urgent fix");
    expect(p.title).toBe("urgent fix");
    expect(p.priority).toBe("P0");
  });

  it("is case-insensitive on priority", () => {
    expect(parseQuickInput("task !p3").priority).toBe("P3");
    expect(parseQuickInput("task !P3").priority).toBe("P3");
  });
});

describe("detectEntity — routes quick-add to the right module", () => {
  it("detects lead / leave / client / task", () => {
    expect(detectEntity("add lead for NovaFit")).toBe("lead");
    expect(detectEntity("create leave")).toBe("leave");
    expect(detectEntity("new client Grainly")).toBe("client");
    expect(detectEntity("push the design")).toBe("task");
  });
});

describe("dueOffsetDays — token → days from today", () => {
  it("today is 0, tomorrow is 1", () => {
    expect(dueOffsetDays("today")).toBe(0);
    expect(dueOffsetDays("tomorrow")).toBe(1);
    expect(dueOffsetDays("tmr")).toBe(1);
  });

  it("a weekday resolves to the next occurrence (never today/past)", () => {
    // Brute-force the invariant rather than pin a date that could drift.
    for (const wd of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
      const d = dueOffsetDays(wd)!;
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(7);
    }
  });

  it("next-week token resolves to 7 days", () => {
    expect(dueOffsetDays("next week")).toBe(7);
  });
});

describe("prettyDue — display labels", () => {
  it("maps tokens to friendly labels", () => {
    expect(prettyDue("today")).toBe("Today");
    expect(prettyDue("tomorrow")).toBe("Tomorrow");
    expect(prettyDue("fri")).toBe("Fri");
    expect(prettyDue(null)).toBe("Tomorrow");
  });
});