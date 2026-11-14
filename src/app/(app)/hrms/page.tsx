import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import { Card, SectionLabel } from "@/components/ui";
import { HrmsWorkbench, type Device, type Review, type Access } from "@/components/hrms/HrmsWorkbench";
import type { AttendanceRecord } from "@/components/hrms/HrmsAttendanceRegister";
import NotificationStatusPanel from "@/components/team/NotificationStatusPanel";
import { istDayStart, istDateKey, overlapWithIst, breakOverlapMs, SHIFT_START_MIN, SHIFT_END_MIN } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HrmsPage() {
  await guardPage("HRMS");

  const session = (await getSession()) as ScopedSession | null;
  let canManage = false;
  if (session?.user?.id) {
    const caps = await effectiveCapsForSession(session);
    canManage = caps.has("hrms.manage");
  }

  const dayStart = istDayStart(new Date());
  const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const now = Date.now();

  const todayDateStr = istDateKey(dayStart);

  const [people, depts, todaySessions, todayManualLogs, todayTaskLogs, todayOverrides] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null },
      include: { department: { select: { name: true } }, manager: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.taskWorkSession.findMany({
      where: { startedAt: { gte: dayStart, lt: nextDay } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.manualTimeLog.findMany({
      where: { date: dayStart },
    }),
    prisma.timeLog.findMany({
      where: { date: dayStart },
    }),
    prisma.attendanceOverride.findMany({ where: { dateStr: todayDateStr } }),
  ]);

  const overrideMap = new Map(todayOverrides.map((o) => [o.employeeId, o]));

  const active = people.filter((p) => p.status === "ACTIVE" || p.status === "PROBATION").length;
  const onLeave = people.filter((p) => p.status === "ON_LEAVE").length;

  // Aggregate attendance data per employee for today
  const attendanceMap: Record<string, AttendanceRecord> = {};

  for (const p of people) {
    const isLeave = p.status === "ON_LEAVE";
    const empSessions = todaySessions.filter((s) => s.assigneeId === p.id);
    const empManual = todayManualLogs.filter((m) => m.employeeId === p.id);
    const empTaskLogs = todayTaskLogs.filter((t) => t.employeeId === p.id);

    let firstPunch: string | null = null;
    let lastActive: string | null = null;
    let sessionMs = 0;
    let otMs = 0;

    if (empSessions.length > 0) {
      const first = empSessions[0].startedAt;
      const istFirst = new Date(first.getTime() + 5.5 * 3600 * 1000);
      const hours = istFirst.getUTCHours();
      const mins = istFirst.getUTCMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const h12 = hours % 12 || 12;
      firstPunch = `${String(h12).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${ampm} IST`;

      const last = empSessions[empSessions.length - 1];
      if (!last.endedAt) {
        lastActive = "Active now";
      } else {
        const istLast = new Date(last.endedAt.getTime() + 5.5 * 3600 * 1000);
        const lhours = istLast.getUTCHours();
        const lmins = istLast.getUTCMinutes();
        const lampm = lhours >= 12 ? "PM" : "AM";
        const lh12 = lhours % 12 || 12;
        lastActive = `${String(lh12).padStart(2, "0")}:${String(lmins).padStart(2, "0")} ${lampm} IST`;
      }

      for (const s of empSessions) {
        const startMs = s.startedAt.getTime();
        const endMs = s.endedAt ? s.endedAt.getTime() : now;
        if (endMs <= startMs) continue;

        const spanDurationMs = endMs - startMs;
        const actualElapsedMs = s.elapsedSec != null ? s.elapsedSec * 1000 : spanDurationMs;
        const scale = spanDurationMs > 0 ? Math.min(1, actualElapsedMs / spanDurationMs) : 1;

        const inShiftRaw = overlapWithIst(startMs, endMs, SHIFT_START_MIN, SHIFT_END_MIN);
        const lunchRaw = breakOverlapMs(startMs, endMs);
        const inShiftProd = Math.max(0, (inShiftRaw - lunchRaw) * scale);
        const otRaw = (overlapWithIst(startMs, endMs, SHIFT_END_MIN, 24 * 60) + overlapWithIst(startMs, endMs, 0, SHIFT_START_MIN)) * scale;

        sessionMs += Math.round(inShiftProd);
        otMs += Math.round(otRaw);
      }
    }

    let manualMs = 0;
    for (const m of empManual) manualMs += m.hours * 3600 * 1000;
    for (const t of empTaskLogs) manualMs += t.hours * 3600 * 1000;

    const totalHours = Number(((sessionMs + manualMs) / (3600 * 1000)).toFixed(1));
    const totalOtHours = Number((otMs / (3600 * 1000)).toFixed(1));

    let attendanceStatus: AttendanceRecord["status"] = "ABSENT";
    if (isLeave) {
      attendanceStatus = "ON_LEAVE";
    } else if (totalHours >= 6.0 || empSessions.length > 0) {
      attendanceStatus = totalHours < 4.0 && empSessions.length > 0 ? "HALF_DAY" : "PRESENT";
    }

    // A manual HR correction for today wins over the computed value — this is
    // the whole point of the override: someone forgot to clock in/out, or a
    // half-day needs recording that no work-session data would ever show.
    const override = overrideMap.get(p.id);

    attendanceMap[p.id] = {
      employeeId: p.id,
      name: p.name,
      department: p.department?.name || "General",
      role: p.role,
      status: override ? (override.status as AttendanceRecord["status"]) : attendanceStatus,
      clockInTime: firstPunch,
      lastActiveTime: lastActive,
      hoursWorked: override ? override.hoursWorked : totalHours,
      otHours: override ? override.otHours : totalOtHours,
      notes: override ? "Manually corrected by HR" : isLeave ? "Approved Leave" : undefined,
    };
  }

  const rows = people.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.title ?? null,
    role: p.role,
    status: p.status,
    departmentId: p.departmentId ?? null,
    departmentName: p.department?.name ?? null,
    managerId: p.managerId ?? null,
    weeklyCapacityHrs: p.weeklyCapacityHrs ?? null,
    dob: p.dob ? p.dob.toISOString() : null,
    joinedAt: p.joinedAt ? p.joinedAt.toISOString() : null,
    employmentType: p.employmentType ?? null,
    personalPhone: p.personalPhone ?? null,
    personalEmail: p.personalEmail ?? null,
    workEmail: p.workEmail ?? null,
    emergencyContactName: p.emergencyContactName ?? null,
    emergencyContactPhone: p.emergencyContactPhone ?? null,
    annualCtc: p.annualCtc === null ? null : Number(p.annualCtc),
    exitReason: p.exitReason ?? null,
    exitedAt: p.exitedAt ? p.exitedAt.toISOString() : null,
    devices: p.devices ? (p.devices as unknown as Device[]) : null,
    performanceReviews: p.performanceReviews ? (p.performanceReviews as unknown as Review[]) : null,
    toolAccess: p.toolAccess ? (p.toolAccess as unknown as Access[]) : null,
  }));

  const managers = people.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-5">
      <div>
        <h1 className="text-[16px] font-semibold text-ink">HRMS</h1>
        <p className="label mt-0.5">{active} active · people ops</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <SectionLabel>Active</SectionLabel>
          <div className="mt-1.5 tnum text-lg font-semibold text-emerald">{active}</div>
        </Card>
        <Card className="p-4">
          <SectionLabel>On leave</SectionLabel>
          <div className="mt-1.5 tnum text-lg font-semibold text-amber">{onLeave}</div>
        </Card>
        <Card className="p-4">
          <SectionLabel>Departments</SectionLabel>
          <div className="mt-1.5 tnum text-lg font-semibold text-tealhi">{depts.length}</div>
        </Card>
      </div>
      <NotificationStatusPanel />
      <HrmsWorkbench
        people={rows}
        departments={depts.map((d) => ({ id: d.id, name: d.name }))}
        managers={managers}
        canManage={canManage}
        currentUserId={session?.user?.id ?? ""}
        initialAttendance={attendanceMap}
        todayDateStr={todayDateStr}
      />
    </div>
  );
}
