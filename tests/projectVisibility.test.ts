import { describe, expect, it } from "vitest";
import {
  deptsForCategory,
  canSeeClient,
  projectVisibleTo,
  dueCountdown,
} from "@/lib/projectVisibility";

describe("deptsForCategory — fuzzy COO mapping", () => {
  it("maps digital-marketing to dm/design/sales", () => {
    expect(deptsForCategory("digital-marketing")).toEqual(["dm", "design", "sales"]);
  });

  it("maps the SaaS pipeline to dev/design via web/saas/app substrings", () => {
    expect(deptsForCategory("Full-Stack Web App & SaaS Pipeline")).toEqual(["dev", "design"]);
  });

  it("unions both groups when both marker sets hit", () => {
    expect(deptsForCategory("digital-marketing + development")).toEqual(
      expect.arrayContaining(["dm", "design", "sales", "dev"]),
    );
  });

  it("fails closed on null/empty/unmapped categories", () => {
    expect(deptsForCategory(null)).toEqual([]);
    expect(deptsForCategory("")).toEqual([]);
    expect(deptsForCategory("Facilities & Housekeeping")).toEqual([]);
  });
});

describe("canSeeClient", () => {
  it("shows client names only to AM / SUPER_ADMIN", () => {
    expect(canSeeClient("ACCOUNT_MANAGER")).toBe(true);
    expect(canSeeClient("SUPER_ADMIN")).toBe(true);
    expect(canSeeClient("EXECUTIVE")).toBe(false);
    expect(canSeeClient("DEPARTMENT_HEAD")).toBe(false);
    expect(canSeeClient(null)).toBe(false);
  });
});

describe("projectVisibleTo", () => {
  const salesTask = { id: "t1", assigneeIds: ["u-sales"] };
  const dmProject = { category: "digital-marketing", tasks: [salesTask] };

  it("leadership sees everything", () => {
    expect(
      projectVisibleTo(
        { category: null, tasks: [] },
        { id: "u-x", deptSlug: "hr", leadership: true },
      ),
    ).toBe(true);
  });

  it("assignment grants visibility regardless of department", () => {
    expect(
      projectVisibleTo(dmProject, { id: "u-sales", deptSlug: "dev", leadership: false }),
    ).toBe(true);
  });

  it("department match grants visibility", () => {
    expect(
      projectVisibleTo(dmProject, { id: "u-other", deptSlug: "dm", leadership: false }),
    ).toBe(true);
  });

  it("mismatched department without assignment stays hidden", () => {
    expect(
      projectVisibleTo(dmProject, { id: "u-other", deptSlug: "dev", leadership: false }),
    ).toBe(false);
  });

  it("unmapped category is assignment-only", () => {
    const p = { category: "Facilities", tasks: [salesTask] };
    expect(projectVisibleTo(p, { id: "u-sales", deptSlug: "dm", leadership: false })).toBe(true);
    expect(projectVisibleTo(p, { id: "u-other", deptSlug: "dm", leadership: false })).toBe(false);
  });
});

describe("dueCountdown — IST calendar days", () => {
  // 2026-10-06 12:00 IST == 06:30 UTC
  const now = Date.parse("2026-10-06T06:30:00Z");

  it("counts future days", () => {
    expect(dueCountdown("2026-10-08", now)).toEqual({
      text: "Due in 2d",
      overdue: false,
      today: false,
    });
  });

  it("names tomorrow and today", () => {
    expect(dueCountdown("2026-10-07", now)?.text).toBe("Due tomorrow");
    expect(dueCountdown("2026-10-06", now)).toEqual({
      text: "Due today",
      overdue: false,
      today: true,
    });
  });

  it("flags overdue", () => {
    expect(dueCountdown("2026-10-03", now)).toEqual({
      text: "Overdue by 3d",
      overdue: true,
      today: false,
    });
  });

  it("returns null for missing/unparseable dates", () => {
    expect(dueCountdown(null, now)).toBeNull();
    expect(dueCountdown("not-a-date", now)).toBeNull();
  });
});
