import { describe, it, expect } from "vitest";
import { taskView, TASK_FLOW } from "@/lib/tasks";

// taskView is a pure mapping — no DB. Build a minimal typed row.
const row = (over: Record<string, unknown>) =>
  ({
    id: "t1", code: "TSK-101", title: "Ship landing", status: "IN_PROGRESS",
    priority: "P1", blocked: false, blockerReason: null, gainLever: null,
    outcome: null, dueDate: null, dueLabel: null, assigneeId: null,
    assignee: null, department: null, departmentColor: null, subtasks: [],
    completedAt: null, ...over,
  }) as never;

describe("taskView — the shared tasks view model", () => {
  it("maps a task to its display shape", () => {
    const v = taskView(row({
      dueDate: new Date("2026-09-06T00:00:00.000Z"),
      assignee: { id: "e1", name: "Riley" },
      department: { id: "d1", name: "Development", color: "#6DBB7C" },
      subtasks: [{ id: "s1", title: "Copy", done: true }, { id: "s2", title: "Design", done: false }],
    }) as never);
    expect(v.code).toBe("TSK-101");
    expect(v.assignee).toBe("Riley");
    expect(v.department).toBe("Development");
    expect(v.departmentColor).toBe("#6DBB7C");
    expect(v.dueDate).toContain("2026-09-06");
    expect(v.subtasks).toHaveLength(2);
    expect(v.subtasks[0]).toMatchObject({ title: "Copy", done: true });
  });

  it("tolerates missing relations (null assignee/department)", () => {
    const v = taskView(row({}) as never);
    expect(v.assignee).toBeNull();
    expect(v.department).toBeNull();
    expect(v.subtasks).toEqual([]);
  });
});

describe("TASK_FLOW — the status state machine (DM-06)", () => {
  it("defines every status with legal transitions", () => {
    expect(TASK_FLOW.TODO).toBeDefined();
    expect(TASK_FLOW.IN_PROGRESS).toBeDefined();
    expect(TASK_FLOW.BLOCKED).toBeDefined();
    expect(TASK_FLOW.DONE).toBeDefined();
  });

  it("a task can move along the happy path", () => {
    expect(TASK_FLOW.TODO).toContain("IN_PROGRESS");
    expect(TASK_FLOW.IN_PROGRESS).toContain("DONE");
  });

  it("DONE reopens to IN_PROGRESS (rework path, never a dead-end)", () => {
    expect(TASK_FLOW.DONE).toContain("IN_PROGRESS");
    expect(TASK_FLOW.DONE).toContain("BLOCKED");
  });
});