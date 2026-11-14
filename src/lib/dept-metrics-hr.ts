import { prisma } from "@/lib/db";
import { crmAudience } from "@/crm-server/services/hierarchy";
import {
  authorizeDept, daysOverdue, denied, fmtIstDate, guarded, istToday, ok, STAFF_WHERE, TASK_OPEN_WHERE,
  type Result, type Scope,
} from "@/lib/dept-metrics-common";

/**
 * HR dashboard metrics. Read-only.
 *
 * Gates (same capabilities the HRMS / LMS pages use): attendance, hiring counts and onboarding
 * need `hrms.view`; LMS completion needs `hrms.view` or `lms.manage`. Personal data stays inside
 * those gates. Scope: 'mine' narrows people-based widgets to the dashboard's own department
 * (the HR team), 'all' is the whole company.
 */

const NO_HR = "People data is for the HR department.";

/** HR data only: viewer must belong to the viewed HR department (or be SUPER_ADMIN / Leadership) and hold hrms.view. */
async function hrGate(userId: string, departmentId: string): Promise<{ ok: true; lms: boolean } | { ok: false; reason: string }> {
  const auth = await authorizeDept(userId, departmentId, "hr");
  if (!auth.ok) return auth;
  const caps = auth.actor.caps;
  if (!caps.has("hrms.view") && !caps.has("lms.manage")) return { ok: false, reason: NO_HR };
  return { ok: true, lms: !caps.has("hrms.view") };
}

/** People in the viewed department only; 'mine' narrows to the viewer. */
const peopleIn = (departmentId: string, scope: Scope, userId: string) => ({
  ...STAFF_WHERE,
  departmentId,
  ...(scope === "mine" ? { id: userId } : {}),
});

/* ------------------------------------------------- Attendance / leave today */

export interface PersonRef { id: string; name: string; note?: string }
export interface AttendanceToday {
  dateLabel: string;
  weekOff: boolean;
  total: number;
  present: number;
  onLeave: number;
  halfDay: number;
  absent: number;
  /** Active, no work session or override recorded yet today. */
  noActivity: number;
  onLeaveList: PersonRef[];
  absentList: PersonRef[];
}

export function attendanceToday(userId: string, scope: Scope, departmentId: string): Promise<Result<AttendanceToday>> {
  return guarded("hr.attendance", async () => {
    const g = await hrGate(userId, departmentId);
    if (!g.ok || g.lms) return denied(g.ok ? NO_HR : g.reason);
    const day = istToday();
    const people = await prisma.employee.findMany({
      where: peopleIn(departmentId, scope, userId),
      select: { id: true, name: true, status: true },
    });
    const ids = people.map((p) => p.id);
    const [sessions, overrides] = await Promise.all([
      prisma.taskWorkSession.groupBy({
        by: ["assigneeId"],
        where: { assigneeId: { in: ids }, OR: [{ startedAt: { gte: day.start, lt: day.end } }, { endedAt: null }] },
      }),
      prisma.attendanceOverride.findMany({ where: { dateStr: day.key, employeeId: { in: ids } } }),
    ]);
    const worked = new Set(sessions.map((s) => s.assigneeId));
    const ovr = new Map(overrides.map((o) => [o.employeeId, o.status]));

    let present = 0, onLeave = 0, halfDay = 0, absent = 0, noActivity = 0;
    const onLeaveList: PersonRef[] = [];
    const absentList: PersonRef[] = [];
    for (const p of people) {
      const o = ovr.get(p.id);
      if (o === "ON_LEAVE" || (!o && p.status === "ON_LEAVE")) {
        onLeave++;
        onLeaveList.push({ id: p.id, name: p.name });
      } else if (o === "ABSENT") {
        absent++;
        absentList.push({ id: p.id, name: p.name });
      } else if (o === "HALF_DAY") halfDay++;
      else if (o === "PRESENT" || worked.has(p.id)) present++;
      else noActivity++;
    }
    return ok({
      dateLabel: fmtIstDate(day.start),
      weekOff: day.dow === 0,
      total: people.length,
      present, onLeave, halfDay, absent, noActivity,
      onLeaveList: onLeaveList.slice(0, 8),
      absentList: absentList.slice(0, 8),
    });
  });
}

/* ------------------------------------------------- Hiring pipeline */

export interface HiringStage { id: string; name: string; count: number; isWon: boolean; isLost: boolean }
export interface HiringPipeline {
  exists: boolean;
  stages: HiringStage[];
  total: number;
  /** Only Sales/Leadership can open the CRM; HR sees the counts without a link. */
  canOpenCrm: boolean;
}

export function hiringPipeline(userId: string, departmentId: string): Promise<Result<HiringPipeline>> {
  return guarded("hr.hiring", async () => {
    const g = await hrGate(userId, departmentId);
    if (!g.ok || g.lms) return denied(g.ok ? NO_HR : g.reason);
    const canOpenCrm = (await crmAudience(userId)).allowed;
    const pipeline = await prisma.crmPipeline.findFirst({
      where: { name: "Hiring" },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pipeline) return ok({ exists: false, stages: [], total: 0, canOpenCrm });
    const grouped = await prisma.crmLead.groupBy({
      by: ["pipelineStageId"],
      where: { pipelineId: pipeline.id, isDuplicate: false },
      _count: { _all: true },
    });
    const by = new Map(grouped.map((g) => [g.pipelineStageId, g._count._all]));
    const stages = pipeline.stages.map((s) => ({
      id: s.id, name: s.name, count: by.get(s.id) ?? 0, isWon: s.isWon, isLost: s.isLost,
    }));
    return ok({ exists: true, stages, total: stages.reduce((n, s) => n + s.count, 0), canOpenCrm });
  });
}

/* ------------------------------------------------- Onboarding */

export interface Joiner { id: string; name: string; joinedLabel: string; openTasks: number; coursesDone: number; coursesTotal: number }
export interface OnboardingTaskRow {
  id: string; code: string; title: string; assigneeId: string | null; assigneeName: string | null;
  dueLabel: string | null; overdue: boolean;
}
export interface Onboarding { joiners: Joiner[]; tasks: OnboardingTaskRow[]; totalTasks: number }

export function onboarding(userId: string, scope: Scope, departmentId: string): Promise<Result<Onboarding>> {
  return guarded("hr.onboarding", async () => {
    const g = await hrGate(userId, departmentId);
    if (!g.ok || g.lms) return denied(g.ok ? NO_HR : g.reason);
    const day = istToday();
    const since = new Date(day.start.getTime() - 30 * 86400000);
    const [joinersRaw, taskWhere] = [
      await prisma.employee.findMany({
        where: { ...peopleIn(departmentId, scope, userId), joinedAt: { gte: since } },
        orderBy: { joinedAt: "desc" },
        take: 6,
        select: { id: true, name: true, joinedAt: true },
      }),
      { ...TASK_OPEN_WHERE, departmentId, title: { contains: "onboard", mode: "insensitive" as const } },
    ];
    const joinerIds = joinersRaw.map((j) => j.id);
    const [openByPerson, enrol, totalTasks, tasks] = await Promise.all([
      prisma.task.groupBy({ by: ["assigneeId"], where: { ...TASK_OPEN_WHERE, assigneeId: { in: joinerIds } }, _count: { _all: true } }),
      prisma.courseEnrollment.groupBy({ by: ["employeeId", "status"], where: { employeeId: { in: joinerIds } }, _count: { _all: true } }),
      prisma.task.count({ where: taskWhere }),
      prisma.task.findMany({
        where: taskWhere,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
        take: 6,
        select: { id: true, code: true, title: true, dueDate: true, assignee: { select: { id: true, name: true } } },
      }),
    ]);
    const openMap = new Map(openByPerson.map((o) => [o.assigneeId, o._count._all]));
    const done = new Map<string, number>();
    const all = new Map<string, number>();
    for (const e of enrol) {
      all.set(e.employeeId, (all.get(e.employeeId) ?? 0) + e._count._all);
      if (e.status === "COMPLETED") done.set(e.employeeId, (done.get(e.employeeId) ?? 0) + e._count._all);
    }
    return ok({
      joiners: joinersRaw.map((j) => ({
        id: j.id,
        name: j.name,
        joinedLabel: j.joinedAt ? fmtIstDate(j.joinedAt) : "",
        openTasks: openMap.get(j.id) ?? 0,
        coursesDone: done.get(j.id) ?? 0,
        coursesTotal: all.get(j.id) ?? 0,
      })),
      totalTasks,
      tasks: tasks.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        assigneeId: t.assignee?.id ?? null,
        assigneeName: t.assignee?.name ?? null,
        dueLabel: t.dueDate ? fmtIstDate(t.dueDate) : null,
        overdue: !!t.dueDate && daysOverdue(t.dueDate, day) > 0,
      })),
    });
  });
}

/* ------------------------------------------------- LMS completion */

export interface CourseRow { id: string; title: string; enrolled: number; completed: number; inProgress: number; pct: number }
export interface LmsCompletion { courses: CourseRow[]; enrolled: number; completed: number; pct: number; staff: number }

export function lmsCompletion(userId: string, scope: Scope, departmentId: string): Promise<Result<LmsCompletion>> {
  return guarded("hr.lms", async () => {
    const g = await hrGate(userId, departmentId);
    if (!g.ok) return denied(g.reason);
    const staffWhere = peopleIn(departmentId, scope, userId);
    const [courses, staff] = await Promise.all([
      prisma.course.findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      }),
      prisma.employee.count({ where: staffWhere }),
    ]);
    const grouped = await prisma.courseEnrollment.groupBy({
      by: ["courseId", "status"],
      where: { employee: staffWhere },
      _count: { _all: true },
    });
    const rows: CourseRow[] = courses.map((c) => {
      let enrolled = 0, completed = 0, inProgress = 0;
      for (const g of grouped) {
        if (g.courseId !== c.id) continue;
        enrolled += g._count._all;
        if (g.status === "COMPLETED") completed += g._count._all;
        if (g.status === "IN_PROGRESS") inProgress += g._count._all;
      }
      return { id: c.id, title: c.title, enrolled, completed, inProgress, pct: enrolled ? Math.round((completed / enrolled) * 100) : 0 };
    });
    const enrolled = rows.reduce((n, r) => n + r.enrolled, 0);
    const completed = rows.reduce((n, r) => n + r.completed, 0);
    return ok({ courses: rows, enrolled, completed, pct: enrolled ? Math.round((completed / enrolled) * 100) : 0, staff });
  });
}
