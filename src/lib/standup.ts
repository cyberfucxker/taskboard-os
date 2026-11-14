import { prisma } from "@/lib/db";
import type { ScopedSession } from "@/lib/scope";
import { istDayStart, istDateKey } from "@/lib/time";

/**
 * Daily standup — mirrors the legacy task tool daily-updates. One update per
 * employee per calendar day. "Nothing about the work should change."
 */

function startOfDay(d: Date): Date {
  return istDayStart(d);
}
function addDays(d: Date, n: number): Date {
  // ms math, not setDate(): the receiver is an IST-midnight instant, and the
  // server's local (America/Denver) calendar day is not the IST one.
  return new Date(d.getTime() + n * 86400000);
}
const isoDay = (d: Date) => istDateKey(d);

export interface StandupView {
  id: string;
  date: string; // ISO date
  employeeId: string;
  employee: string;
  role: string;
  dept: string | null;
  deptColor: string | null;
  did: string | null;
  doing: string | null;
  blockedOn: string | null;
  createdAt: string;
  isOwn: boolean;
}

export async function getTodayUpdate(employeeId: string) {
  const today = startOfDay(new Date());
  return prisma.dailyUpdate.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });
}

export async function submitStandup(
  employeeId: string,
  data: { did?: string | null; doing?: string | null; blockedOn?: string | null },
) {
  const today = startOfDay(new Date());
  const update = await prisma.dailyUpdate.upsert({
    where: { employeeId_date: { employeeId, date: today } },
    create: { employeeId, date: today, ...data },
    update: { ...data },
    include: { employee: { select: { id: true, name: true, departmentId: true } } },
  });

  let deptName: string | null = null;
  let deptColor: string | null = null;
  if (update.employee.departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: update.employee.departmentId },
      select: { name: true, color: true },
    });
    deptName = dept?.name ?? null;
    deptColor = dept?.color ?? null;
  }

  return { ...update, employee: { ...update.employee, department: { name: deptName, color: deptColor } } };
}

export async function getStandupFeed(session: ScopedSession, dateStr?: string): Promise<StandupView[]> {
  const date = dateStr ? startOfDay(new Date(dateStr + "T00:00:00Z")) : startOfDay(new Date());
  const role = session.user.role;
  // SUPER_ADMIN sees every department. A Department Head / Team Lead sees
  // their OWN department's standups (everyone in it, not just themselves) —
  // never another department's. Everyone else sees their dept + their own.
  const where: Record<string, unknown> = { date };
  if (role === "SUPER_ADMIN") {
    // no filter — org-wide
  } else if ((role === "DEPARTMENT_HEAD" || role === "TEAM_LEAD") && session.user.departmentId) {
    where.employee = { departmentId: session.user.departmentId };
  } else {
    where.OR = [
      { employeeId: session.user.id },
      ...(session.user.departmentId ? [{ employee: { departmentId: session.user.departmentId } }] : []),
    ];
  }

  const rows = await prisma.dailyUpdate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { employee: { select: { id: true, name: true, role: true, departmentId: true } } },
  });

  const deptMap = new Map<string, { name: string; color: string }>();
  const deptIds = new Set(rows.map((r) => r.employee.departmentId).filter((id) => id !== null) as string[]);
  if (deptIds.size > 0) {
    const depts = await prisma.department.findMany({
      where: { id: { in: Array.from(deptIds) } },
      select: { id: true, name: true, color: true },
    });
    depts.forEach((d) => deptMap.set(d.id, { name: d.name, color: d.color }));
  }

  return rows.map((r) => {
    const dept = r.employee.departmentId ? deptMap.get(r.employee.departmentId) : null;
    return {
      id: r.id,
      date: isoDay(r.date),
      employeeId: r.employee.id,
      role: r.employee.role,
      createdAt: r.createdAt.toISOString(),
      employee: r.employee.name,
      dept: dept?.name ?? null,
      deptColor: dept?.color ?? null,
      did: r.did,
      doing: r.doing,
      blockedOn: r.blockedOn,
      isOwn: r.employee.id === session.user.id,
    };
  });
}

/** Last 5 days of standups for a given employee (or all, for leaders). */
export async function getWeekFeed(session: ScopedSession, employeeId?: string) {
  const end = startOfDay(new Date());
  const start = addDays(end, -5);
  const where: Record<string, unknown> = { date: { gte: start, lte: end } };
  if (employeeId) {
    where.employeeId = employeeId;
  } else if (session.user.role === "SUPER_ADMIN") {
    // see all
  } else if (session.user.role === "DEPARTMENT_HEAD" && session.user.departmentId) {
    where.employee = { departmentId: session.user.departmentId };
  } else {
    where.OR = [
      { employeeId: session.user.id },
      ...(session.user.departmentId ? [{ employee: { departmentId: session.user.departmentId } }] : []),
    ];
  }
  const rows = await prisma.dailyUpdate.findMany({
    where,
    orderBy: { date: "desc" },
    include: { employee: { select: { name: true, departmentId: true } } },
  });

  const deptMap = new Map<string, { name: string; color: string }>();
  const deptIds = new Set(rows.map((r) => r.employee.departmentId).filter((id) => id !== null) as string[]);
  if (deptIds.size > 0) {
    const depts = await prisma.department.findMany({
      where: { id: { in: Array.from(deptIds) } },
      select: { id: true, name: true, color: true },
    });
    depts.forEach((d) => deptMap.set(d.id, { name: d.name, color: d.color }));
  }

  return rows.map((r) => {
    const dept = r.employee.departmentId ? deptMap.get(r.employee.departmentId) : null;
    return {
      date: isoDay(r.date),
      employee: r.employee.name,
      dept: dept?.name ?? null,
      did: r.did,
      doing: r.doing,
      blockedOn: r.blockedOn,
    };
  });
}
