import { prisma } from "@/lib/db";
import type { Task, TaskWorkSession, ManualTimeLog, TimeLog } from "@prisma/client";

/**
 * Shift-aware time math for the "8-hour day" record.
 *
 * Official (owner-confirmed) rules:
 *  - Shift: 09:30–18:30 IST (540 min = 9h).
 *  - Lunch break: 13:30–14:10 IST (40 min, excluded from productive time).
 *  - Productive shift window net duration: 9h - 40m = 8h 20m.
 *  - Daily Goal: 8h (28,800,000 ms).
 *  - Work within 09:30–18:30 (excluding lunch) counts directly toward the 8h meter.
 *  - Overtime (OT): Work after 18:30 IST counts towards OT and shows separately (+OT).
 *  - Break subtraction: Lunch break (13:30-14:10) is subtracted from shift time and reported in breakMs.
 *  - Single-track: at most one open session per employee (enforced in startWork).
 *  - Shift-end auto-pause: after 19:00 IST any still-open session is closed lazily.
 */

// Shift constants (Asia/Kolkata, UTC+5:30). Times as minutes-from-midnight IST.
export const SHIFT_START_MIN = 9 * 60 + 30; // 09:30 IST (570)
export const SHIFT_END_MIN = 18 * 60 + 30; // 18:30 IST (1110)
export const BREAK_START_MIN = 13 * 60 + 30; // 13:30 IST (810)
export const BREAK_END_MIN = 14 * 60 + 10; // 14:10 IST (850)
export const DAY_GOAL_MS = 8 * 60 * 60 * 1000; // 28,800,000 — 8 productive hours
export const PAUSE_AT_MIN = 19 * 60; // 19:00 IST — shift-end auto-pause

// Categories that should never trigger an interrupt nudge mid-task.
export const INTERRUPT_SENSITIVE: ReadonlySet<string> = new Set([
  "CALL",
  "MEETING",
  "SCREENING",
  "CRM",
]);

// Interval (ms) between completion check-ins while a task is running.
export const CHECKIN_INTERVAL_MS = 45 * 60 * 1000; // 45 min
// After N consecutive "Not done" answers, ask for a reason.
export const CHECKIN_ASK_REASON_AFTER = 3;

/** Convert a UTC Date to IST wall-clock minutes-from-midnight. */
export function istMin(d: Date): number {
  const ist = new Date(d.getTime() + 5 * 3600 * 1000 + 30 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** Start of the IST calendar day (00:00 IST) for a Date. */
export function istDayStart(d: Date): Date {
  // 00:00 IST = 18:30 UTC previous day = Date.UTC(y,m,d-0) − 5h30.
  const ist = new Date(d.getTime() + 5 * 3600 * 1000 + 30 * 60 * 1000);
  const utc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(utc - (5 * 3600 * 1000 + 30 * 60 * 1000));
}

function istDayStartFor(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return new Date(utc - (5 * 3600 * 1000 + 30 * 60 * 1000));
}

const IST_OFFSET_MS = 5 * 3600 * 1000 + 30 * 60 * 1000;

/** YYYY-MM-DD for the IST calendar day containing `d`. */
export function istDateKey(d: Date): string {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-${String(s.getUTCDate()).padStart(2, "0")}`;
}

/** Add whole days to an IST-midnight instant. IST has no DST, so ms math is exact. */
export function addIstDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** IST weekday (0=Sun..6=Sat) for `d`. */
export function istDayOfWeek(d: Date): number {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
}

/** IST midnight of the Sunday that starts `d`'s IST week. */
export function istWeekStart(d: Date): Date {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  const sunday = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - s.getUTCDay());
  return new Date(sunday - IST_OFFSET_MS);
}

/**
 * Lazy shift-end auto-pause. After 19:00 IST, any open work-session for this
 * employee is closed (elapsedSec frozen, task returned to TODO with startedAt
 * cleared) — mirroring a manual pause.
 */
async function _autoPauseOverdue(employeeId: string): Promise<{ closed: number }> {
  if (istMin(new Date()) < PAUSE_AT_MIN) return { closed: 0 };
  const open = await prisma.taskWorkSession.findMany({
    where: { assigneeId: employeeId, endedAt: null },
  });
  let closed = 0;
  for (const s of open) {
    const now = new Date();
    await prisma.taskWorkSession.update({
      where: { id: s.id },
      data: {
        endedAt: now,
        elapsedSec: Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 1000)),
        note: "auto-paused (shift end)",
      },
    });
    await prisma.task.update({
      where: { id: s.taskId },
      data: { status: "TODO", startedAt: null },
    });
    closed++;
  }
  return { closed };
}

/** Overlap (ms) between [a,b) and a fixed IST interval [fromMin,toMin). */
export function overlapWithIst(msStart: number, msEnd: number, fromMin: number, toMin: number): number {
  if (msEnd <= msStart) return 0;
  const istStart = istMin(new Date(msStart));
  const istEnd = istMin(new Date(msEnd));

  const startClamp = Math.max(istStart, fromMin);
  const endClamp = Math.min(istEnd, toMin);
  if (endClamp <= startClamp) return 0;
  return (endClamp - startClamp) * 60 * 1000;
}

/** Break subtraction: how much of a session overlaps the lunch break. */
export function breakOverlapMs(startMs: number, endMs: number): number {
  return overlapWithIst(startMs, endMs, BREAK_START_MIN, BREAK_END_MIN);
}

/** Merge overlapping [startMs, endMs] spans; returns sorted, non-overlapping list. */
export function mergeIntervals(spans: Array<[number, number]>): Array<[number, number]> {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1]) { if (e > last[1]) last[1] = e; } else out.push([s, e]);
  }
  return out;
}

/** Is a span inside the productive shift window (09:30–18:30 minus lunch)? */
export function isProductiveSpan(istStartMin: number, istEndMin: number): boolean {
  if (istStartMin < SHIFT_START_MIN || istEndMin > SHIFT_END_MIN) return false;
  const lunchOverlap = Math.max(
    0,
    Math.min(istEndMin, BREAK_END_MIN) - Math.max(istStartMin, BREAK_START_MIN)
  );
  const spanMin = istEndMin - istStartMin;
  return spanMin > lunchOverlap;
}

export interface TodayTask {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string;
  dueLabel: string | null;
  elapsedMs: number;
  priority: string;
  subtaskTotal?: number;
  subtaskDone?: number;
  clientName?: string | null;
  projectName?: string | null;
}

/** A row in the merged "Recently worked on" list on the Today page. */
export interface TodayRecent {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string;
  elapsedMs: number;
  lastWorkedMs: number | null;
  isRunning: boolean;
}

export interface TodayEmployeeInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  department: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
  } | null;
}

export interface TodayStatus {
  employee?: TodayEmployeeInfo | null;
  /** Persisted shift pause state (survives reloads and devices) */
  isShiftPaused: boolean;
  shiftPauseReason: string | null;
  shiftPausedAt: string | null;
  /** Productive ms toward the 8h goal (tracked - break + manual in-window). */
  loggedMs: number;
  goalMs: number;
  /** Break overlap subtracted from today's tracked time (display only). */
  breakMs: number;
  sessionMs: number;
  manualMs: number;
  /** Overtime ms (after 18:30). */
  otMs: number;
  running: { taskId: string; code: string; title: string; category: string; startedAtMs: number } | null;
  tasksToday: TodayTask[];
  /** Merged list: the user's own (assigned / creator / involved) tasks, sorted
   *  by most-recently-worked, with the running task pinned on top. */
  recentlyWorked: TodayRecent[];
  /** Check-in state: whether to surface an interruptible nudge. */
  checkin: {
    due: boolean;
    askReason: boolean;
    streakNo: number;
    runningTaskId: string | null;
  };
}

/**
 * Sum productive + OT time for an employee "today" (IST), plus their running
 * session, today's tasks, the merged "recently worked on" list, and check-in
 * state. Single source for the Today page SSR and `/api/me/status`.
 */
export async function meToday(employeeId: string): Promise<TodayStatus> {
  // Shift-end auto-pause (lazy): after 19:00 IST, close any still-open session.
  ;

  const dayStart = istDayStart(new Date());
  const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const now = Date.now();

  const [
    employee,
    sessions,
    manualLogs,
    taskLogs,
    runningRaw,
    checkinRaw,
    involvedTasks,
  ] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        title: true,
        shiftPaused: true,
        shiftPauseReason: true,
        shiftPausedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
      },
    }),
    prisma.taskWorkSession.findMany({
      where: { assigneeId: employeeId, startedAt: { gte: dayStart, lt: nextDay } },
      include: {
        task: {
          select: {
            id: true,
            outcome: true,
            code: true,
            title: true,
            category: true,
            status: true,
            priority: true,
            dueLabel: true,
            subtasks: { select: { id: true, done: true } },
            client: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
      },
    }),
    prisma.manualTimeLog.findMany({ where: { employeeId, date: dayStart } }),
    prisma.timeLog.findMany({ where: { employeeId, date: dayStart } }),
    prisma.taskWorkSession.findFirst({ where: { assigneeId: employeeId, endedAt: null } }),
    (prisma as any).checkinState.findUnique({ where: { employeeId } }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        status: { not: "DONE" },
        OR: [
          { assignees: { some: { employeeId } } },
          { assigneeId: employeeId },
          { creatorId: employeeId },
        ],
        // Today's Queue is for what actually needs attention today, not the
        // employee's entire open backlog: tasks already in motion (in
        // progress, blocked, in review) or due today/overdue. A TODO task
        // due next month has no business cluttering today's list.
        AND: [
          {
            OR: [
              { status: "IN_PROGRESS" },
              { status: "BLOCKED" },
              { status: "IN_REVIEW" },
              { dueDate: { lte: nextDay } },
            ],
          },
        ],
      },
      include: {
        workSessions: {
          where: { assigneeId: employeeId },
          select: { startedAt: true, endedAt: true, elapsedSec: true },
        },
        subtasks: {
          select: { id: true, done: true },
        },
        client: {
          select: { name: true },
        },
        project: {
          select: { name: true },
        },
      },
    }),
  ]);

  let sessionMs = 0;
  let breakMs = 0;
  let otMs = 0;
  const tasksToday: TodayTask[] = [];

  for (const s of sessions) {
    const startMs = s.startedAt.getTime();
    const endMs = s.endedAt ? s.endedAt.getTime() : now;
    if (endMs <= startMs) continue;

    const spanDurationMs = endMs - startMs;
    const actualElapsedMs = s.elapsedSec != null ? s.elapsedSec * 1000 : spanDurationMs;
    const scale = spanDurationMs > 0 ? Math.min(1, actualElapsedMs / spanDurationMs) : 1;

    const inShiftRaw = overlapWithIst(startMs, endMs, SHIFT_START_MIN, SHIFT_END_MIN);
    const lunchRaw = breakOverlapMs(startMs, endMs);
    const inShiftProd = Math.max(0, (inShiftRaw - lunchRaw) * scale);
    const otRaw = overlapWithIst(startMs, endMs, SHIFT_END_MIN, 24 * 60) * scale;
    const earlyRaw = overlapWithIst(startMs, endMs, 0, SHIFT_START_MIN) * scale;
    const totalTaskElapsedMs = Math.round(inShiftProd + otRaw + earlyRaw);

    // Track on today's tasks
    if (s.task) {
      const t = s.task;
      const found = tasksToday.find((x) => x.id === t.id);
      if (found) {
        found.elapsedMs += totalTaskElapsedMs;
      } else {
        const subtasks = (t as any).subtasks ?? [];
        tasksToday.push({
          id: t.id,
          code: t.code,
          title: t.title,
          status: t.status,
          category: t.category ?? "OTHER",
          dueLabel: (t as any).dueLabel ?? null,
          elapsedMs: totalTaskElapsedMs,
          priority: (t as any).priority ?? "P2",
          subtaskTotal: subtasks.length,
          subtaskDone: subtasks.filter((st: { done: boolean }) => st.done).length,
          clientName: (t as any).client?.name ?? null,
          projectName: (t as any).project?.name ?? null,
        });
      }
    }
  }

  // Total productive/OT hours — union intervals so overlapping sessions count once.
  for (const [ms, me] of mergeIntervals(
    sessions
      .map((s) => [s.startedAt.getTime(), s.endedAt ? s.endedAt.getTime() : now] as [number, number])
      .filter(([a, b]) => b > a)
  )) {
    const inShiftRaw = overlapWithIst(ms, me, SHIFT_START_MIN, SHIFT_END_MIN);
    const lunchRaw = breakOverlapMs(ms, me);
    sessionMs += Math.round(Math.max(0, inShiftRaw - lunchRaw));
    breakMs += Math.round(lunchRaw);
    otMs += Math.round(
      overlapWithIst(ms, me, SHIFT_END_MIN, 24 * 60) + overlapWithIst(ms, me, 0, SHIFT_START_MIN)
    );
  }

  // Manual hours (on-task + off-task) inside the productive window.
  let manualMs = 0;
  for (const m of manualLogs) manualMs += m.hours * 3600 * 1000;
  for (const t of taskLogs) manualMs += t.hours * 3600 * 1000;

  // Running session info
  let running: TodayStatus["running"] = null;
  if (runningRaw) {
    const r = runningRaw as TaskWorkSession & { task?: Task };
    const runningTask = r.task ?? (await prisma.task.findUnique({ where: { id: r.taskId } }));
    if (runningTask) {
      running = {
        taskId: r.taskId,
        code: (runningTask as Task).code ?? "",
        title: (runningTask as Task).title ?? "",
        category: (runningTask as Task).category ?? "OTHER",
        startedAtMs: r.startedAt.getTime(),
      };
    }
  }

  // Fold in involved tasks that haven't been worked on yet today
  for (const t of involvedTasks) {
    if (!tasksToday.some((tt) => tt.id === t.id)) {
      const subtasks = (t as any).subtasks ?? [];
      tasksToday.push({
        id: t.id,
        code: t.code,
        title: t.title,
        status: t.status,
        category: t.category ?? "OTHER",
        dueLabel: (t as any).dueLabel ?? null,
        elapsedMs: 0,
        priority: t.priority,
        subtaskTotal: subtasks.length,
        subtaskDone: subtasks.filter((st: { done: boolean }) => st.done).length,
        clientName: (t as any).client?.name ?? null,
        projectName: (t as any).project?.name ?? null,
      });
    }
  }

  // Sort tasksToday: running task first, then active IN_PROGRESS/TODO by priority (P0 -> P3), then DONE at end
  tasksToday.sort((a, b) => {
    const isARunning = running?.taskId === a.id;
    const isBRunning = running?.taskId === b.id;
    if (isARunning !== isBRunning) return isARunning ? -1 : 1;
    const isADone = a.status === "DONE";
    const isBDone = b.status === "DONE";
    if (isADone !== isBDone) return isADone ? 1 : -1;
    const prioOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const pA = prioOrder[a.priority] ?? 4;
    const pB = prioOrder[b.priority] ?? 4;
    if (pA !== pB) return pA - pB;
    return a.title.localeCompare(b.title);
  });

  // Merged recently worked list
  const recentMap = new Map<string, TodayRecent>();
  for (const t of involvedTasks) {
    let last = t.createdAt.getTime();
    let elapsedMs = 0;
    for (const ws of t.workSessions) {
      if (ws.endedAt && ws.elapsedSec != null) elapsedMs += ws.elapsedSec * 1000;
      else elapsedMs += Math.max(0, now - ws.startedAt.getTime());
      const st = ws.startedAt.getTime();
      if (st > last) last = st;
    }
    recentMap.set(t.id, {
      id: t.id,
      code: t.code,
      title: t.title,
      status: t.status,
      category: t.category ?? "OTHER",
      elapsedMs,
      lastWorkedMs: last,
      isRunning: running?.taskId === t.id,
    });
  }

  for (const t of tasksToday) {
    if (!recentMap.has(t.id)) {
      recentMap.set(t.id, {
        id: t.id,
        code: t.code,
        title: t.title,
        status: t.status,
        category: t.category,
        elapsedMs: t.elapsedMs,
        lastWorkedMs: now,
        isRunning: running?.taskId === t.id,
      });
    }
  }

  const recentlyWorked = Array.from(recentMap.values())
    .sort((a, b) => {
      if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
      if ((b.lastWorkedMs ?? 0) !== (a.lastWorkedMs ?? 0))
        return (b.lastWorkedMs ?? 0) - (a.lastWorkedMs ?? 0);
      return a.title.localeCompare(b.title);
    })
    .slice(0, 20);

  // Check-in state
  const checkin = {
    due: Boolean(
      runningRaw &&
        ((checkinRaw as any)?.lastAskedAt
          ? Date.now() - new Date((checkinRaw as any).lastAskedAt).getTime() >= CHECKIN_INTERVAL_MS
          : true)
    ),
    askReason: (checkinRaw as any)?.askReason ?? false,
    streakNo: (checkinRaw as any)?.streakNo ?? 0,
    runningTaskId: running ? running.taskId : null,
  };

  return {
    employee: employee
      ? {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role: employee.role,
          title: employee.title,
          department: employee.department
            ? {
                id: employee.department.id,
                name: employee.department.name,
                slug: employee.department.slug,
                color: employee.department.color,
              }
            : null,
        }
      : null,
    isShiftPaused: employee?.shiftPaused ?? false,
    shiftPauseReason: employee?.shiftPauseReason ?? null,
    shiftPausedAt: employee?.shiftPausedAt?.toISOString() ?? null,
    loggedMs: sessionMs + manualMs,
    goalMs: DAY_GOAL_MS,
    breakMs,
    sessionMs,
    manualMs,
    otMs,
    running,
    tasksToday,
    recentlyWorked,
    checkin,
  };
}

/** 7-day time log for the Time report. */
export async function myTimeLog(employeeId: string, days = 7) {
  const out: {
    date: string;
    sessionMs: number;
    manualMs: number;
    otMs: number;
    entries: {
      code?: string;
      title?: string;
      category: string;
      ms: number;
      source: "session" | "task" | "manual";
      outcome?: boolean;
    }[];
  }[] = [];
  const today = istDayStart(new Date());

  for (let i = 0; i < days; i++) {
    const day = new Date(today.getTime() - i * 24 * 3600 * 1000);
    const next = new Date(day.getTime() + 24 * 3600 * 1000);
    const sessions = await prisma.taskWorkSession.findMany({
      where: { assigneeId: employeeId, startedAt: { gte: day, lt: next } },
      include: { task: { select: { code: true, title: true, category: true, outcome: true } } },
    });
    const manualLogs = await prisma.manualTimeLog.findMany({ where: { employeeId, date: day } });
    const taskLogs = await prisma.timeLog.findMany({
      where: { employeeId, date: day },
      include: { task: { select: { code: true, title: true, category: true } } },
    });

    const entries: (typeof out)[number]["entries"] = [];
    let sessionMs = 0,
      manualMs = 0,
      otMs = 0;
    const now = Date.now();

    for (const s of sessions) {
      const startMs = s.startedAt.getTime();
      const endMs = new Date(s.endedAt ? s.endedAt.getTime() : now).getTime();
      if (endMs <= startMs) continue;

      const spanDurationMs = endMs - startMs;
      const actualElapsedMs = s.elapsedSec != null ? s.elapsedSec * 1000 : spanDurationMs;
      const scale = spanDurationMs > 0 ? Math.min(1, actualElapsedMs / spanDurationMs) : 1;

      const inShiftRaw = overlapWithIst(startMs, endMs, SHIFT_START_MIN, SHIFT_END_MIN);
      const lunchRaw = breakOverlapMs(startMs, endMs);
      const inShiftProd = Math.max(0, (inShiftRaw - lunchRaw) * scale);

      const otRaw = (overlapWithIst(startMs, endMs, SHIFT_END_MIN, 24 * 60) + overlapWithIst(startMs, endMs, 0, SHIFT_START_MIN)) * scale;

      const prod = Math.round(inShiftProd);
      const ot = Math.round(otRaw);

      const code = (s.task as any)?.code;
      const cat = (s.task as any)?.category ?? "OTHER";
      const title = (s.task as any)?.title ?? "Task session";

      if (prod > 0) {
        entries.push({ code, title, category: cat, ms: prod, source: "session" });
      }
      if (ot > 0) {
        entries.push({
          code,
          title: `${title} (OT)`,
          category: cat,
          ms: ot,
          source: "session",
          outcome: Boolean((s.task as any)?.outcome),
        });
      }
    }

    // Total sessionMs/otMs — union intervals so overlapping sessions count once.
    for (const [ms, me] of mergeIntervals(
      sessions
        .map((s) => [s.startedAt.getTime(), new Date(s.endedAt ? s.endedAt.getTime() : now).getTime()] as [number, number])
        .filter(([a, b]) => b > a)
    )) {
      const inShiftRaw = overlapWithIst(ms, me, SHIFT_START_MIN, SHIFT_END_MIN);
      const lunchRaw = breakOverlapMs(ms, me);
      sessionMs += Math.round(Math.max(0, inShiftRaw - lunchRaw));
      otMs += Math.round(
        overlapWithIst(ms, me, SHIFT_END_MIN, 24 * 60) + overlapWithIst(ms, me, 0, SHIFT_START_MIN)
      );
    }

    for (const tl of taskLogs) {
      manualMs += tl.hours * 3600 * 1000;
      entries.push({
        code: (tl.task as any).code,
        title: (tl.task as any).title,
        category: (tl.task as any).category ?? "OTHER",
        ms: tl.hours * 3600 * 1000,
        source: "task",
      });
    }
    for (const m of manualLogs) {
      manualMs += m.hours * 3600 * 1000;
      entries.push({
        category: "OTHER",
        ms: m.hours * 3600 * 1000,
        source: "manual",
        title: m.note ?? "Off-task",
      });
    }
    out.push({ date: istDateKey(day), sessionMs, manualMs, otMs, entries });
  }

  return out.reverse();
}

/**
 * Team timesheet — daily totals for EVERY employee within a date window.
 * Used by the leadership Time module (previous-days' data per employee).
 */
export async function teamTimesheet(options: { from: Date; to: Date }) {
  const { from, to } = options;
  const next = new Date(to.getTime() + 24 * 3600 * 1000);

  const [employees, sessions, manualLogs, taskLogs] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, role: true, department: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.taskWorkSession.findMany({
      where: {
        endedAt: { not: null },
        startedAt: { gte: from, lt: next },
      },
      include: { task: { select: { code: true, title: true, category: true } } },
    }),
    prisma.manualTimeLog.findMany({
      where: { date: { gte: from, lt: next } },
      select: { employeeId: true, date: true, hours: true, note: true },
    }),
    prisma.timeLog.findMany({
      where: { date: { gte: from, lt: next } },
      select: {
        employeeId: true,
        date: true,
        hours: true,
        note: true,
        task: { select: { code: true, title: true, category: true } },
      },
    }),
  ]);

  /** day key → per-employee aggregate */
  const rawSpans = new Map<string, Map<string, Array<[number, number]>>>();
  const daysMap = new Map<string, Map<string, {
    sessionMs: number; otMs: number; manualMs: number; entries: Array<{
      code?: string; title?: string; category: string; ms: number; source: "session" | "task" | "manual";
    }>;
  }>>();

  const dayKey = (d: Date) => istDateKey(d);
  const now = Date.now();

  for (const s of sessions) {
    const key = dayKey(s.startedAt);
    if (!daysMap.has(key)) daysMap.set(key, new Map());
    const empMap = daysMap.get(key)!;
    const empId = s.assigneeId;
    if (!empMap.has(empId)) empMap.set(empId, { sessionMs: 0, otMs: 0, manualMs: 0, entries: [] });
    const row = empMap.get(empId)!;

    const startMs = s.startedAt.getTime();
    const endMs = new Date(s.endedAt ?? now).getTime();
    if (endMs <= startMs) continue;

    // Collect raw interval for the union pass.
    if (!rawSpans.has(key)) rawSpans.set(key, new Map());
    const spanMap = rawSpans.get(key)!;
    if (!spanMap.has(empId)) spanMap.set(empId, []);
    spanMap.get(empId)!.push([startMs, endMs]);

    // Per-session entries for detail view (scale-adjusted).
    const spanDurationMs = endMs - startMs;
    const actualElapsedMs = s.elapsedSec != null ? s.elapsedSec * 1000 : spanDurationMs;
    const scale = spanDurationMs > 0 ? Math.min(1, actualElapsedMs / spanDurationMs) : 1;

    const inShiftRaw = overlapWithIst(startMs, endMs, SHIFT_START_MIN, SHIFT_END_MIN);
    const lunchRaw = breakOverlapMs(startMs, endMs);
    const inShiftProd = Math.max(0, (inShiftRaw - lunchRaw) * scale);
    const otRaw = (overlapWithIst(startMs, endMs, SHIFT_END_MIN, 24 * 60) + overlapWithIst(startMs, endMs, 0, SHIFT_START_MIN)) * scale;
    const prod = Math.round(inShiftProd);
    const ot = Math.round(otRaw);
    const code = (s.task as any)?.code;
    const cat = (s.task as any)?.category ?? "OTHER";
    const title = (s.task as any)?.title ?? "Task session";

    if (prod > 0) row.entries.push({ code, title, category: cat, ms: prod, source: "session" });
    if (ot > 0) row.entries.push({ code, title: `${title} (OT)`, category: cat, ms: ot, source: "session" });
  }

  // sessionMs/otMs from merged intervals per (day, employee) — overlaps counted once.
  for (const [key, spanMap] of rawSpans) {
    const empMap = daysMap.get(key)!;
    for (const [empId, spans] of spanMap) {
      const row = empMap.get(empId)!;
      for (const [ms, me] of mergeIntervals(spans)) {
        const inShiftRaw = overlapWithIst(ms, me, SHIFT_START_MIN, SHIFT_END_MIN);
        const lunchRaw = breakOverlapMs(ms, me);
        row.sessionMs += Math.round(Math.max(0, inShiftRaw - lunchRaw));
        row.otMs += Math.round(
          overlapWithIst(ms, me, SHIFT_END_MIN, 24 * 60) + overlapWithIst(ms, me, 0, SHIFT_START_MIN)
        );
      }
    }
  }

  for (const t of taskLogs) {
    const key = dayKey(t.date);
    if (!daysMap.has(key)) daysMap.set(key, new Map());
    const empMap = daysMap.get(key)!;
    if (!empMap.has(t.employeeId)) empMap.set(t.employeeId, { sessionMs: 0, otMs: 0, manualMs: 0, entries: [] });
    const row = empMap.get(t.employeeId)!;
    row.manualMs += t.hours * 3600 * 1000;
    row.entries.push({
      code: (t.task as any)?.code,
      title: (t.task as any)?.title,
      category: (t.task as any)?.category ?? "OTHER",
      ms: t.hours * 3600 * 1000,
      source: "task",
    });
  }

  for (const m of manualLogs) {
    const key = dayKey(m.date);
    if (!daysMap.has(key)) daysMap.set(key, new Map());
    const empMap = daysMap.get(key)!;
    if (!empMap.has(m.employeeId)) empMap.set(m.employeeId, { sessionMs: 0, otMs: 0, manualMs: 0, entries: [] });
    const row = empMap.get(m.employeeId)!;
    row.manualMs += m.hours * 3600 * 1000;
    row.entries.push({ title: m.note ?? "Off-task", category: "OTHER", ms: m.hours * 3600 * 1000, source: "manual" });
  }

  // Assemble: employees x days
  const allDays: string[] = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
    allDays.push(istDateKey(d));
  }
  // alias employee by id
  const byId = new Map(employees.map((e) => [e.id, e]));

  const rows = employees.map((e) => {
    const daysOut: Array<{ date: string; sessionMs: number; otMs: number; manualMs: number; totalMs: number }> =
      allDays.map((date) => {
        const row = daysMap.get(date)?.get(e.id);
        const sessionMs = row?.sessionMs ?? 0;
        const otMs = row?.otMs ?? 0;
        const manualMs = row?.manualMs ?? 0;
        return { date, sessionMs, otMs, manualMs, totalMs: sessionMs + manualMs + otMs };
      });
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      departmentName: e.department?.name ?? null,
      days: daysOut,
      weekTotalMs: daysOut.reduce((a, b) => a + b.totalMs, 0),
      weekOtMs: daysOut.reduce((a, b) => a + b.otMs, 0),
    };
  });

  return { rows, days: allDays };
}

/** Log hours manually. taskId → TimeLog upsert (increment); else ManualTimeLog. */
export async function logHours(args: {
  employeeId: string;
  taskId?: string | null;
  hours: number;
  date?: string; // YYYY-MM-DD (IST). Defaults today.
  note?: string;
}) {
  const { employeeId, taskId, hours, date, note } = args;
  const day = date ? istDayStartFor(date) : istDayStart(new Date());
  if (taskId) {
    const existing = await prisma.timeLog.findUnique({
      where: { taskId_employeeId_date: { taskId, employeeId, date: day } },
    });
    if (existing) {
      await prisma.timeLog.update({
        where: { id: existing.id },
        data: { hours: existing.hours + hours, note: note ?? existing.note },
      });
      return { entry: { source: "task" as const, hours: existing.hours + hours } };
    }
    await prisma.timeLog.create({
      data: { taskId, employeeId, hours, date: day, note: note ?? null },
    });
    return { entry: { source: "task" as const, hours } };
  }
  await prisma.manualTimeLog.create({ data: { employeeId, hours, date: day, note: note ?? null } });
  return { entry: { source: "manual" as const, hours } };
}

/** Check-in answer: "Done" | "Not done" (+ optional reason at 3 no's). */
export async function answerCheckin(args: {
  employeeId: string;
  taskId: string;
  done: boolean;
  outcome?: string;
  reason?: string;
}) {
  const { employeeId, taskId, done, outcome, reason } = args;
  const cur = await (prisma as any).checkinState.findUnique({ where: { employeeId } });
  if (done) {
    const open = await (prisma as any).taskWorkSession.findFirst({
      where: { taskId, assigneeId: employeeId, endedAt: null },
    });
    if (open) {
      const now = new Date();
      await (prisma as any).taskWorkSession.update({
        where: { id: open.id },
        data: {
          endedAt: now,
          elapsedSec: Math.round((now.getTime() - open.startedAt.getTime()) / 1000),
        },
      });
    }
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "DONE", completedAt: new Date(), outcome: outcome ?? undefined },
    });
    if (cur) {
      await (prisma as any).checkinState.update({
        where: { employeeId },
        data: { streakNo: 0, askReason: false, lastAskedAt: null, runningTaskId: null },
      });
    }
    return { ok: true as const, action: "done" as const, outcome: outcome ?? null, reason: null };
  }

  // Not done → increment streak
  const streakNo = ((cur as any)?.streakNo ?? 0) + 1;
  const askReason =
    streakNo >= CHECKIN_ASK_REASON_AFTER ? true : ((cur as any)?.askReason ?? false);
  await (prisma as any).checkinState.upsert({
    where: { employeeId },
    create: { employeeId, runningTaskId: taskId, lastAskedAt: new Date(), streakNo, askReason },
    update: { runningTaskId: taskId, streakNo, askReason, lastAskedAt: new Date() },
  });
  return { ok: true as const, action: "not_done" as const, outcome: null, reason: reason ?? null };
}
