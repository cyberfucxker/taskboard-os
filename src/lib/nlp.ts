import { Priority } from "@prisma/client";

/**
 * NLP quick-capture parser — the TaskBoard signature input syntax:
 *
 *   "Ship NovaFit landing @maya #dev !P1 ~fri"
 *
 *   @assignee  -> assignee token (name/email fragment)
 *   #department-> department token
 *   !priority  -> !P0 | !P1 | !P2 | !P3
 *   ~due       -> due token ("today" | "tomorrow" | weekday | date)
 *
 * Pure function: no DB, no IO. Kept separate so it is trivially unit-tested
 * and reusable by the workspace UI, the command palette, and (later) the
 * quick-add endpoint and AI capture agents (AGT-03.3).
 */

export const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

export interface ParsedQuickInput {
  raw: string;
  title: string;
  assignee: string | null; // @token
  department: string | null; // #token (case preserved, uppercased by caller)
  priority: Priority;
  due: string | null; // ~token
}

const DEFAULT_PRIORITY: Priority = "P2";

export function parseQuickInput(input: string): ParsedQuickInput {
  const raw = (input ?? "").trim();

  let title = raw;
  let assignee: string | null = null;
  let department: string | null = null;
  let due: string | null = null;
  let priority: Priority = DEFAULT_PRIORITY;

  const at = raw.match(/@([a-zA-Z0-9_.-]+)/);
  if (at) {
    assignee = at[1];
    title = title.replace(at[0], "").trim();
  }

  const hash = raw.match(/#([a-zA-Z0-9_.-]+)/);
  if (hash) {
    department = hash[1];
    title = title.replace(hash[0], "").trim();
  }

  const prio = raw.match(/!(\s*)(p0|p1|p2|p3)/i);
  if (prio) {
    const p = prio[2].toUpperCase() as Priority;
    if (PRIORITIES.includes(p)) priority = p;
    title = title.replace(prio[0], "").trim();
  }

  const tilde = raw.match(/~([a-zA-Z0-9_.-]+)/);
  if (tilde) {
    due = tilde[1];
    title = title.replace(tilde[0], "").trim();
  }

  // Keep leading '!'/'@'/'#'/'~' artifacts out of the title
  title = title.replace(/^[!@#~+\-]+/, "").trim();

  return { raw, title, assignee, department, priority, due };
}

/** Detect which entity a quick-add command targets (task | lead | leave | client). */
export type QuickEntity = "task" | "lead" | "leave" | "client" | "task";

export function detectEntity(input: string): QuickEntity {
  const trimmed = input.trim().toLowerCase();
  if (/^(add|create|new)\s+lead/.test(trimmed)) return "lead";
  if (/^(add|create|request|new)\s+leave/.test(trimmed)) return "leave";
  if (/^(add|create|new)\s+client/.test(trimmed)) return "client";
  return "task";
}

/** Days-from-today for a due token (for computing the stored dueDate). */
export function dueOffsetDays(token: string | null): number | null {
  if (!token) return 1;
  const t = token.toLowerCase();
  if (t === "today") return 0;
  if (t === "tomorrow" || t === "tmr" || t === "tmrw") return 1;
  const WEEK: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  const wd = WEEK[t.slice(0, 3)];
  if (wd !== undefined) {
    const today = new Date().getDay();
    let diff = wd - today;
    if (diff <= 0) diff += 7;
    return diff;
  }
  if (/^next/.test(t)) return 7;
  return 1;
}

/** Map a raw due token to a friendly display label (used by views). */
const WEEKDAYS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export function prettyDue(token: string | null): string {
  if (!token) return "Tomorrow";
  const t = token.toLowerCase();
  if (t === "today") return "Today";
  if (t === "tomorrow" || t === "tmr" || t === "tmrw") return "Tomorrow";
  if (/^next/.test(t)) return "Next wk";
  if (WEEKDAYS[t.slice(0, 3)]) return WEEKDAYS[t.slice(0, 3)];
  return token;
}
