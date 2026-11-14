import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveCaps, type AccessOverrides, type Capability } from "@/lib/rbac";

/**
 * Shared helpers for the department-dashboard metrics (Sales / HR / Finance / Leadership).
 * Server-only: reads through the shared Prisma client, never writes.
 *
 * Every metric returns a `Result`, so a widget can render a designed denied / error state
 * instead of throwing the whole dashboard.
 */
export type Scope = "mine" | "all";

export type Result<T> =
  | { state: "ok"; data: T }
  | { state: "denied"; reason: string }
  | { state: "error"; message: string };

export const ok = <T,>(data: T): Result<T> => ({ state: "ok", data });
export const denied = <T = never>(reason: string): Result<T> => ({ state: "denied", reason });

/** Run a metric; any thrown error becomes an error state (and is logged server-side). */
export async function guarded<T>(label: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[dept-metrics] ${label} failed`, e);
    return { state: "error", message: "Could not load this data" };
  }
}

/* ---------------------------------------------------------------- IST time */

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface IstDay {
  /** 00:00 IST today, as an instant. */
  start: Date;
  /** 00:00 IST tomorrow. */
  end: Date;
  /** yyyy-mm-dd of the IST day. */
  key: string;
  /** 0 = Sunday ... 6 = Saturday (IST). */
  dow: number;
  now: Date;
}

export function istToday(now: Date = new Date()): IstDay {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const start = new Date(midnightUtc - IST_OFFSET_MS);
  const key = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
  return { start, end: new Date(start.getTime() + DAY_MS), key, dow: ist.getUTCDay(), now };
}

/** "3:30 PM" in IST. */
export function fmtIstTime(d: Date): string {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  const h = s.getUTCHours();
  const m = s.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "5 Oct" in IST. */
export function fmtIstDate(d: Date): string {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}`;
}

/** Compact age such as "35m", "5h", "3d". */
export function fmtAge(fromMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - fromMs) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/** Whole days between an IST-day start and a due date (positive = overdue by n days). */
export function daysOverdue(due: Date, day: IstDay): number {
  return Math.max(0, Math.ceil((day.start.getTime() - due.getTime()) / DAY_MS));
}

/** Rupees from paise with Indian digit grouping and a compact lakh/crore form. No toLocale. */
export function fmtInrFromPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${trim(abs / 10000000)} Cr`;
  if (abs >= 100000) return `${sign}₹${trim(abs / 100000)} L`;
  const s = String(abs);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${sign}₹${grouped}`;
}
function trim(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/* ------------------------------------------------------------------- Actor */

export interface Actor {
  id: string;
  departmentId: string | null;
  role: Role;
  deptSlug: string | null;
  caps: Set<Capability>;
}

/** The viewer, with capabilities computed the same way every guard does (role + dept + overrides). */
export async function getActor(userId: string): Promise<Actor | null> {
  const me = await prisma.employee.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, role: true, departmentId: true, accessOverrides: true, department: { select: { slug: true } } },
  });
  if (!me) return null;
  const deptSlug = me.department?.slug ?? null;
  const caps = effectiveCaps(me.role, deptSlug, (me.accessOverrides as AccessOverrides | null) ?? null);
  return { id: me.id, departmentId: me.departmentId, role: me.role, deptSlug, caps };
}

/** Cross-department audience (COO rule): SUPER_ADMIN or a member of the Leadership department. Nobody else. */
export function isLeadershipAudience(a: Actor): boolean {
  return a.role === "SUPER_ADMIN" || a.deptSlug === "leadership";
}

export type DeptAuth =
  | { ok: true; actor: Actor; dept: { id: string; slug: string; name: string } }
  | { ok: false; reason: string };

/**
 * COO rule, enforced at query level: a department's information is only for that department.
 * The viewer must be a member of the viewed department (or SUPER_ADMIN / Leadership), and the
 * viewed department must be the one this widget family belongs to (sales / hr / finance).
 */
export async function authorizeDept(userId: string, departmentId: string, expectedSlug: string): Promise<DeptAuth> {
  const [actor, dept] = await Promise.all([
    getActor(userId),
    prisma.department.findFirst({ where: { id: departmentId, deletedAt: null }, select: { id: true, slug: true, name: true } }),
  ]);
  if (!actor || !dept) return { ok: false, reason: "Department not found." };
  if (dept.slug !== expectedSlug) return { ok: false, reason: "This widget belongs to another department's dashboard." };
  if (!isLeadershipAudience(actor) && actor.departmentId !== dept.id) {
    return { ok: false, reason: `This is ${dept.name} department information.` };
  }
  return { ok: true, actor, dept };
}

/** Employees that count as staff (not exited, not client portal seats). */
export const STAFF_WHERE = {
  deletedAt: null,
  portalClientId: null,
  status: { not: "EXITED" as const },
  role: { notIn: ["CLIENT_ADMIN", "CLIENT_VIEWER", "EXTERNAL_CONTRACTOR"] as Role[] },
};

export const TASK_OPEN_WHERE = { deletedAt: null, archivedAt: null, status: { not: "DONE" as const } };
