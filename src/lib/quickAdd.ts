import type { Priority } from "@prisma/client";
import { parseQuickInput } from "./nlp";

/**
 * Quick-add parser — the pure, UI-free half of R6 (RENOVATION §3.6).
 *
 *   "follow up Rene tomorrow 4pm p1 #Sales @Devon"
 *
 * Accepts the shipped sigil syntax from `src/lib/nlp.ts` (@assignee #token !P1 ~fri)
 * *and* the bare R6 syntax, because both are already in users' hands:
 *
 *   @token   -> assignee        #token -> project (R6 §2; nlp reads # as department)
 *   !P1      -> priority        p1     -> priority (standalone word only)
 *   ~fri     -> due             today | tomorrow | mon..sun | dd/mm
 *   4pm      -> time            4:30pm | 16:30
 *
 * Pure function: no DB, no IO, no React — so it is unit-testable and reusable by the
 * Cmd-K palette, Home quick add and (later) an API route. `now` is injectable so the
 * IST day-rollover boundary is testable.
 *
 * All date math is fixed +05:30 IST arithmetic on plain calendar fields, never the
 * server timezone and never `Date.getDay()` — that class of bug hid two hours of work
 * every day until 2026-09-27.
 */

export const DEFAULT_PRIORITY: Priority = "P2";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const IST_OFFSET_SUFFIX = "+05:30";

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Standalone-word matches only, so "compass" and "monsoon" survive intact. */
const DATE_WORD =
  "(?:^|\\s)(today|tomorrow|tmrw|tmr|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?(?=\\s|$)";

export interface QuickAdd {
  raw: string;
  title: string;
  /** Calendar day in IST, yyyy-mm-dd. */
  dueDate: string | null;
  /** 24h IST clock time, HH:mm. */
  dueTime: string | null;
  /** ISO instant with +05:30 — set only when the user typed a time. */
  dueDateTime: string | null;
  /** null = not specified; the caller applies DEFAULT_PRIORITY. */
  priority: Priority | null;
  projectName: string | null;
  assigneeName: string | null;
}

/** IST calendar fields for an instant. */
export function istNow(now: Date = new Date()): {
  year: number; month: number; day: number; weekday: number; minutes: number;
} {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    weekday: ist.getUTCDay(),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** yyyy-mm-dd for the IST day containing `now`. */
export function istDateIso(now: Date = new Date()): string {
  const p = istNow(now);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Calendar-day arithmetic on an ISO date — pure, no timezone involved. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Resolve a due token to an IST calendar day. Returns null for anything unknown so the
 * caller can ignore it rather than silently defaulting to the wrong day.
 */
export function resolveDueToken(token: string, todayIso: string): string | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (t === "today" || t === "now") return todayIso;
  if (t === "tomorrow" || t === "tmr" || t === "tmrw") return addDaysIso(todayIso, 1);

  const nextMatch = t.match(/^next\s+([a-z]+)/);
  const word = nextMatch ? nextMatch[1] : t;
  const target = WEEKDAY_INDEX[word.slice(0, 3)];
  if (target !== undefined) {
    if (nextMatch) return addDaysIso(todayIso, 7);
    const todayWeekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
    let diff = target - todayWeekday;
    if (diff <= 0) diff += 7;
    return addDaysIso(todayIso, diff);
  }

  const numeric = t.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year = Number(todayIso.slice(0, 4));
    if (`${year}-${pad2(month)}-${pad2(day)}` < todayIso) year += 1;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  if (t === "next" || t === "nextweek" || t === "next week") return addDaysIso(todayIso, 7);
  return null;
}

function extractTime(title: string): { dueTime: string | null; rest: string } {
  const twelve = title.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s|$)/i);
  if (twelve) {
    const rest = title.replace(twelve[0], " ");
    const hour12 = Number(twelve[1]);
    const mins = twelve[2] ? Number(twelve[2]) : 0;
    let hour = hour12 % 12;
    if (/pm/i.test(twelve[3])) hour += 12;
    if (hour12 >= 1 && hour12 <= 12 && mins <= 59) return { dueTime: `${pad2(hour)}:${pad2(mins)}`, rest };
    return { dueTime: null, rest };
  }
  const twentyFour = title.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/);
  if (twentyFour) {
    const rest = title.replace(twentyFour[0], " ");
    const hour = Number(twentyFour[1]);
    const mins = Number(twentyFour[2]);
    if (hour <= 23 && mins <= 59) return { dueTime: `${pad2(hour)}:${pad2(mins)}`, rest };
    return { dueTime: null, rest };
  }
  return { dueTime: null, rest: title };
}

/**
 * Parse a quick-add line into typed create-task defaults.
 *
 * @param input raw user text
 * @param now   injectable clock (tests pass a fixed instant to cover IST rollover)
 */
export function parseQuickAdd(input: string, now: Date = new Date()): QuickAdd {
  const raw = (input ?? "").trim();
  const todayIso = istDateIso(now);
  const nowMinutes = istNow(now).minutes;

  const sigil = parseQuickInput(raw);
  let title = sigil.title;

  let priority: Priority | null = null;
  if (/!(\s*)p[0-3]\b/i.test(raw)) priority = sigil.priority;
  if (priority === null) {
    const bare = title.match(/(?:^|\s)p([0-3])(?=\s|$)/i);
    if (bare) {
      priority = `P${bare[1].toUpperCase()}` as Priority;
      title = title.replace(bare[0], " ");
    }
  }

  const { dueTime, rest } = extractTime(title);
  title = rest;

  let dueDate: string | null = sigil.due ? resolveDueToken(sigil.due, todayIso) : null;

  if (!dueDate) {
    const word = title.match(new RegExp(DATE_WORD, "i"));
    if (word) {
      dueDate = resolveDueToken(word[1], todayIso);
      title = title.replace(word[0], " ");
    } else {
      const numeric = title.match(/(?:^|\s)(\d{1,2})[/.-](\d{1,2})(?=\s|$)/);
      if (numeric) {
        dueDate = resolveDueToken(`${numeric[1]}/${numeric[2]}`, todayIso);
        if (dueDate) title = title.replace(numeric[0], " ");
      }
    }
  }

  if (!dueDate && dueTime) {
    const [hh, mm] = dueTime.split(":").map(Number);
    const dueMinutes = hh * 60 + mm;
    dueDate = dueMinutes > nowMinutes ? todayIso : addDaysIso(todayIso, 1);
  }

  const dueDateTime = dueDate && dueTime ? `${dueDate}T${dueTime}:00${IST_OFFSET_SUFFIX}` : null;

  const cleaned = title.replace(/\s+/g, " ").trim();

  return {
    raw,
    title: cleaned || raw,
    dueDate,
    dueTime,
    dueDateTime,
    priority,
    projectName: sigil.department,
    assigneeName: sigil.assignee,
  };
}

/**
 * Shape the result for the real `createTask` input (`src/lib/tasks.ts`): `dueDate` is a
 * Prisma DateTime, so the ISO instant is passed when a time was typed, otherwise the
 * bare IST day.
 */
export function toCreateTaskInput(q: QuickAdd): {
  title: string;
  priority?: Priority;
  dueDate?: string;
  due?: string;
} {
  const out: { title: string; priority?: Priority; dueDate?: string; due?: string } = {
    title: q.title,
  };
  if (q.priority) out.priority = q.priority;
  const when = q.dueDateTime ?? q.dueDate;
  if (when) out.dueDate = when;
  return out;
}