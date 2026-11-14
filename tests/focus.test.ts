import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * T8 — Focus block.
 *
 * These tests pin the promises the feature makes to staff, because each one is
 * something that used to go wrong with a plain per-task timer:
 *  - a block never holds more than 3 tasks, and never a task you don't own;
 *  - there is never more than one open block and never more than one open session;
 *  - switching moves the timer without pretending sibling work stopped;
 *  - starting an ordinary task must not throw away a block task's IN_PROGRESS state;
 *  - per-task time is still just TaskWorkSession rows — nothing is invented.
 */

// The fake DB has to exist inside vi.hoisted so the mock factory can close over it.
const { prismaMock, state } = vi.hoisted(() => {
  const state: { db: any } = { db: null };
  const prismaMock: any = {
    task: {
      findMany: (...a: any[]) => state.db.task.findMany(...a),
      findFirst: (...a: any[]) => state.db.task.findFirst(...a),
      update: (...a: any[]) => state.db.task.update(...a),
    },
    focusBlock: {
      findFirst: (...a: any[]) => state.db.focusBlock.findFirst(...a),
      create: (...a: any[]) => state.db.focusBlock.create(...a),
      update: (...a: any[]) => state.db.focusBlock.update(...a),
    },
    taskWorkSession: {
      findMany: (...a: any[]) => state.db.taskWorkSession.findMany(...a),
      findFirst: (...a: any[]) => state.db.taskWorkSession.findFirst(...a),
      create: (...a: any[]) => state.db.taskWorkSession.create(...a),
      update: (...a: any[]) => state.db.taskWorkSession.update(...a),
    },
    employee: { update: async () => ({}) },
    $transaction: async (fn: any) => fn(prismaMock),
  };
  return { prismaMock, state };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/eventlog", () => ({ emitEvent: vi.fn().mockResolvedValue({ id: "act1" }) }));

import {
  assertBlockSize,
  blockElapsedMs,
  endBlock,
  FocusBlockError,
  getOpenBlock,
  normaliseTaskIds,
  startBlock,
  switchActive,
} from "@/lib/focus";
import { startWork } from "@/lib/tasks";

const ME = "emp_me";
const MEMBER = new Set<string>();
const LEADER_CAPS = new Set<string>(["tasks.assign"]);

/** Enough of Prisma's query surface for focus.ts and startWork. */
function matches(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "OR") {
      if (!cond.some((c: any) => matches(row, c))) return false;
      continue;
    }
    const value = row[key];
    if (cond !== null && typeof cond === "object") {
      if ("in" in cond) {
        if (!cond.in.includes(value)) return false;
      } else if ("not" in cond) {
        if (cond.not === value) return false;
      } else {
        return false;
      }
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

function makeDb(seed: { tasks?: any[]; blocks?: any[]; sessions?: any[] }) {
  const db: any = {
    tasks: structuredClone(seed.tasks ?? []),
    blocks: structuredClone(seed.blocks ?? []),
    sessions: structuredClone(seed.sessions ?? []),
    statusWrites: [] as { id: string; status: string }[],
  };
  let seq = 0;
  const pick = (rows: any[], orderBy?: any) => {
    const list = orderBy?.startedAt === "desc" ? [...rows].sort((a, b) => +b.startedAt - +a.startedAt) : rows;
    return list[0] ? structuredClone(list[0]) : null;
  };
  const tx = {
    task: {
      findMany: async ({ where }: any) => db.tasks.filter((t: any) => matches(t, where)).map((row: any) => structuredClone(row)),
      findFirst: async ({ where, orderBy }: any) => pick(db.tasks.filter((t: any) => matches(t, where)), orderBy),
      update: async ({ where, data }: any) => {
        const row = db.tasks.find((t: any) => t.id === where.id);
        Object.assign(row, data);
        if (data.status) db.statusWrites.push({ id: where.id, status: data.status });
        return structuredClone(row);
      },
    },
    focusBlock: {
      findFirst: async ({ where, orderBy }: any) => pick(db.blocks.filter((b: any) => matches(b, where)), orderBy),
      create: async ({ data }: any) => {
        const row: any = { id: `blk${++seq}`, startedAt: new Date(), endedAt: null, ...data };
        db.blocks.push(row);
        return structuredClone(row);
      },
      update: async ({ where, data }: any) => {
        const row = db.blocks.find((b: any) => b.id === where.id);
        Object.assign(row, data);
        return structuredClone(row);
      },
    },
    taskWorkSession: {
      findMany: async ({ where }: any) => db.sessions.filter((s: any) => matches(s, where)).map((row: any) => structuredClone(row)),
      findFirst: async ({ where }: any) => pick(db.sessions.filter((s: any) => matches(s, where))),
      create: async ({ data }: any) => {
        const row: any = { id: `ses${++seq}`, startedAt: new Date(), endedAt: null, elapsedSec: null, note: null, ...data };
        db.sessions.push(row);
        return structuredClone(row);
      },
      update: async ({ where, data }: any) => {
        const row = db.sessions.find((s: any) => s.id === where.id);
        Object.assign(row, data);
        return structuredClone(row);
      },
    },
  };
  return Object.assign(db, tx);
}

function task(id: string, over: any = {}) {
  return {
    id,
    code: id.toUpperCase(),
    title: `Task ${id}`,
    status: "TODO",
    startedAt: null,
    assigneeId: ME,
    creatorId: ME,
    deletedAt: null,
    completedAt: null,
    assignees: [{ id: `ta_${id}`, employeeId: ME }],
    ...over,
  };
}

const openSessions = (db: any, who = ME) => db.sessions.filter((s: any) => s.assigneeId === who && s.endedAt === null);
const statusOf = (db: any, id: string) => db.tasks.find((t: any) => t.id === id).status;

beforeEach(() => {
  state.db = makeDb({
    tasks: [task("t1"), task("t2"), task("t3"), task("t4"), task("other", {
      assigneeId: "emp_other",
      creatorId: "emp_other",
      assignees: [{ id: "ta_other", employeeId: "emp_other" }],
    })],
  });
});

describe("focus block — validation", () => {
  it("keeps tap order as rank and drops blanks and duplicates", () => {
    expect(normaliseTaskIds(["t3", " t1 ", "t3", "", null, 7])).toEqual(["t3", "t1"]);
  });

  it("refuses more than 3 tasks with a 400", async () => {
    await expect(startBlock(["t1", "t2", "t3", "t4"], ME, MEMBER)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an empty selection with a 400", () => {
    expect(() => assertBlockSize([])).toThrow(FocusBlockError);
  });

  it("refuses a task the employee is not involved in with a 403", async () => {
    await expect(startBlock(["t1", "other"], ME, MEMBER)).rejects.toMatchObject({ status: 403 });
    // Leadership may still track it.
    await expect(startBlock(["t1", "other"], ME, LEADER_CAPS)).resolves.toMatchObject({ taskIds: ["t1", "other"] });
  });
});

describe("focus block — starting", () => {
  it("opens one block and exactly one session, on the first-ranked task", async () => {
    const block = await startBlock(["t2", "t1"], ME, MEMBER);
    expect(block.taskIds).toEqual(["t2", "t1"]);
    expect(block.tasks.map((t) => t.rank)).toEqual([1, 2]);
    expect(block.activeTaskId).toBe("t2");

    expect(state.db.blocks.filter((b: any) => b.endedAt === null)).toHaveLength(1);
    const open = openSessions(state.db);
    expect(open).toHaveLength(1);
    expect(open[0].taskId).toBe("t2");
  });

  it("marks every task in the block IN_PROGRESS, not just the active one", async () => {
    await startBlock(["t1", "t2", "t3"], ME, MEMBER);
    expect(statusOf(state.db, "t1")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t2")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t3")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t4")).toBe("TODO");
  });

  it("skips DONE tasks instead of silently reopening them", async () => {
    state.db.tasks.find((t: any) => t.id === "t2").status = "DONE";
    const block = await startBlock(["t1", "t2"], ME, MEMBER);
    expect(block.taskIds).toEqual(["t1"]);
    expect(statusOf(state.db, "t2")).toBe("DONE");
  });

  it("replaces an already-open block rather than opening a second one", async () => {
    await startBlock(["t1"], ME, MEMBER);
    await startBlock(["t2"], ME, MEMBER);
    expect(state.db.blocks.filter((b: any) => b.endedAt === null)).toHaveLength(1);
    expect(openSessions(state.db)).toHaveLength(1);
    expect(openSessions(state.db)[0].taskId).toBe("t2");
  });
});

describe("focus block — switching", () => {
  it("moves the one open session and leaves siblings IN_PROGRESS", async () => {
    await startBlock(["t1", "t2", "t3"], ME, MEMBER);
    const block = await switchActive("t3", ME, MEMBER);

    expect(block.activeTaskId).toBe("t3");
    const open = openSessions(state.db);
    expect(open).toHaveLength(1);
    expect(open[0].taskId).toBe("t3");
    // The closed session kept its time rather than being deleted.
    const closed = state.db.sessions.filter((s: any) => s.endedAt !== null);
    expect(closed).toHaveLength(1);
    expect(closed[0].note).toBe("focus switch");
    expect(statusOf(state.db, "t1")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t2")).toBe("IN_PROGRESS");
  });

  it("is a no-op when switching to the task already active", async () => {
    await startBlock(["t1", "t2"], ME, MEMBER);
    await switchActive("t1", ME, MEMBER);
    expect(openSessions(state.db)).toHaveLength(1);
    expect(state.db.sessions).toHaveLength(1);
  });

  it("refuses a task that is not in the block with a 400", async () => {
    await startBlock(["t1", "t2"], ME, MEMBER);
    await expect(switchActive("t4", ME, MEMBER)).rejects.toMatchObject({ status: 400 });
  });

  it("404s when there is no open block", async () => {
    await expect(switchActive("t1", ME, MEMBER)).rejects.toMatchObject({ status: 404 });
  });
});

describe("focus block — ending", () => {
  it("closes the session and the block, and applies the chosen outcomes", async () => {
    await startBlock(["t1", "t2", "t3"], ME, MEMBER);
    const result = await endBlock(ME, MEMBER, { t1: "done", t2: "in_progress", t3: "todo" });

    expect(result.tasks).toEqual([
      { taskId: "t1", status: "done" },
      { taskId: "t2", status: "in_progress" },
      { taskId: "t3", status: "todo" },
    ]);
    expect(openSessions(state.db)).toHaveLength(0);
    expect(state.db.blocks.filter((b: any) => b.endedAt === null)).toHaveLength(0);
    expect(statusOf(state.db, "t1")).toBe("DONE");
    expect(statusOf(state.db, "t2")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t3")).toBe("TODO");
    expect(await getOpenBlock(ME)).toBeNull();
  });

  it("defaults to keeping the active task in progress and the rest in To do", async () => {
    await startBlock(["t1", "t2"], ME, MEMBER);
    await endBlock(ME, MEMBER);
    expect(statusOf(state.db, "t1")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t2")).toBe("TODO");
  });

  it("never drags a task completed during the block back to To do", async () => {
    await startBlock(["t1", "t2"], ME, MEMBER);
    // Completed from the task drawer while the block was still open.
    state.db.tasks.find((t: any) => t.id === "t2").status = "DONE";
    const result = await endBlock(ME, MEMBER, { t1: "todo", t2: "todo" });
    expect(result.tasks).toContainEqual({ taskId: "t2", status: "done" });
    expect(statusOf(state.db, "t2")).toBe("DONE");
  });
});

describe("focus block — ordinary Start still respects single-track", () => {
  it("does not reset a focus-block sibling to To do when another task is started", async () => {
    await startBlock(["t1", "t2"], ME, MEMBER);
    // The employee gives up on the block and starts an unrelated task directly.
    await startWork("t3", ME, MEMBER);
    expect(openSessions(state.db)).toHaveLength(1);
    expect(openSessions(state.db)[0].taskId).toBe("t3");
    expect(statusOf(state.db, "t1")).toBe("IN_PROGRESS");
    expect(statusOf(state.db, "t2")).toBe("IN_PROGRESS");
  });

  it("still resets a non-block sibling to To do", async () => {
    state.db.sessions.push({ id: "ses_pre", taskId: "t4", assigneeId: ME, startedAt: new Date(), endedAt: null, elapsedSec: null, note: null });
    await startWork("t1", ME, MEMBER);
    expect(statusOf(state.db, "t4")).toBe("TODO");
  });
});

describe("focus block — combined timer maths", () => {
  it("is wall-clock since the block started", () => {
    expect(blockElapsedMs(1_000_000, null, 3_000_000)).toBe(2_000_000);
  });

  it("subtracts a break the employee is currently on", () => {
    expect(blockElapsedMs(0, 10_000, 20_000)).toBe(10_000);
  });

  it("never goes negative", () => {
    expect(blockElapsedMs(5_000, null, 1_000)).toBe(0);
  });
});