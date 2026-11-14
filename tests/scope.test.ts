import { describe, it, expect } from "vitest";
import { scopedTaskWhere, type ScopedSession } from "@/lib/scope";

// Pure — scopedTaskWhere never touches the DB; it builds the Prisma filter from
// the session's department claims. (Importing scope.ts instantiates the Prisma
// client but scopedTaskWhere itself performs no queries.)
const mkSession = (over: Record<string, unknown>): ScopedSession =>
  ({ user: { role: "EXECUTIVE", id: "emp-1", departmentId: null, departmentSlug: null, ...over } }) as unknown as ScopedSession;

describe("scopedTaskWhere — attribute-level task visibility", () => {
  it("leads and admins see the whole board (no filter)", async () => {
    const s = mkSession({ role: "SUPER_ADMIN", departmentId: "d1" });
    await expect(scopedTaskWhere(s as ScopedSession)).resolves.toEqual({});

    const head = mkSession({ role: "DEPARTMENT_HEAD", departmentId: "d1" });
    await expect(scopedTaskWhere(head as ScopedSession)).resolves.toEqual({});

    const lead = mkSession({ role: "TEAM_LEAD", departmentId: "d2" });
    await expect(scopedTaskWhere(lead as ScopedSession)).resolves.toEqual({});
  });

  it("an executive without a department sees only tasks they are attached to", async () => {
    const where = await scopedTaskWhere(mkSession({ departmentId: null }));
    const or = where.OR as Array<Record<string, unknown>>;
    // No department clause — a department-less exec gets no board at all.
    expect(or.some((c) => "departmentId" in c)).toBe(false);
    // ...but every way of being attached still grants that one task.
    expect(or.some((c) => (c as { assigneeId?: string }).assigneeId === "emp-1")).toBe(true);
    expect(or.some((c) => (c as { assignees?: unknown }).assignees)).toBe(true);
    expect(or.some((c) => (c as { creatorId?: string }).creatorId === "emp-1")).toBe(true);
    expect(or.some((c) => (c as { comments?: unknown }).comments)).toBe(true);
    expect(or.some((c) => (c as { timeLogs?: unknown }).timeLogs)).toBe(true);
    expect(or.some((c) => (c as { workSessions?: unknown }).workSessions)).toBe(true);
  });

  it("a participant keeps their task even when it lives in another department", async () => {
    // A DM exec who commented on a dev task sees that task — and nothing else
    // from the dev board.
    const where = await scopedTaskWhere(mkSession({ departmentId: "dept-dm" }));
    const or = where.OR as Array<Record<string, unknown>>;
    expect(or.some((c) => (c as { comments?: { some?: unknown } }).comments?.some)).toBe(true);
    // The only department clause is their own.
    const deptClauses = or.filter((c) => "departmentId" in c);
    expect(deptClauses).toHaveLength(1);
    expect((deptClauses[0] as { departmentId: string }).departmentId).toBe("dept-dm");
  });

  it("a department member sees their department PLUS their own assigned/created tasks", async () => {
    const where = await scopedTaskWhere(mkSession({ departmentId: "dept-dm" }));
    const or = where.OR as Array<Record<string, unknown>>;
    expect(or.some((c) => (c as { departmentId?: string }).departmentId === "dept-dm")).toBe(true);
    expect(or.some((c) => (c as { assigneeId?: string }).assigneeId === "emp-1")).toBe(true);
    expect(or.some((c) => (c as { creatorId?: string }).creatorId === "emp-1")).toBe(true);
  });

  it("a DM employee is restricted to their department scope — never cross-department", async () => {
    const where = await scopedTaskWhere(mkSession({ departmentId: "dept-dm" }));
    const clauses = where.OR as Array<Record<string, string>>;
    // Every clause is either THIS department, or THIS user — no clause can
    // reach another department or a commercial rollup.
    for (const c of clauses) {
      if (c.departmentId) expect(c.departmentId).toBe("dept-dm");
    }
    // A relation clause must pin this user and must not widen to the department.
    for (const c of clauses) {
      const json = JSON.stringify(c);
      if (json.includes("employeeId") || json.includes("assigneeId") || json.includes("authorId")) {
        expect(json).toContain("emp-1");
      }
    }
  });
});