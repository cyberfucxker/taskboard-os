import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchIcsEvents } from "@/lib/ical";
import { effectiveCapsForSession, scopedTaskWhere } from "@/lib/scope";

export const dynamic = "force-dynamic";

export interface UnifiedCalendarEvent {
  id: string;
  title: string;
  type: "TASK_DEADLINE" | "MEETING" | "LEAD_DISCOVERY" | "PROJECT_MILESTONE" | "HR_LEAVE" | "PERSONAL_CALENDAR";
  startTime: string;
  endTime: string;
  allDay: boolean;
  status: string;
  priority?: string;
  url?: string;
  joinUrl?: string;
  location?: string;
  attendees?: { name: string; email?: string }[];
  associatedEntity?: {
    type: "TASK" | "LEAD" | "CLIENT" | "PROJECT" | "EMPLOYEE";
    id: string;
    label: string;
  };
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startStr = searchParams.get("start");
    const endStr = searchParams.get("end");
    const filterType = searchParams.get("type");
    const requestedEmployeeId = searchParams.get("employeeId");

    // Each employee's calendar is their own by default — the main Calendar
    // page previously called this with no employeeId at all, which fell
    // through every "if (employeeId)" guard below and returned literally
    // every meeting and every task in the company to every viewer. Only
    // leadership (board.view/admin.scope) may look at someone else's
    // calendar by passing a different employeeId.
    const caps = await effectiveCapsForSession(session as any);
    const canViewOthers = caps.has("board.view") || caps.has("admin.scope");
    const employeeId = canViewOthers && requestedEmployeeId ? requestedEmployeeId : session.user.id;
    const viewerEmail =
      employeeId === session.user.id
        ? session.user.email
        : (await prisma.employee.findUnique({ where: { id: employeeId }, select: { email: true } }))?.email;

    const now = new Date();
    const rangeStart = startStr ? new Date(startStr) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const rangeEnd = endStr ? new Date(endStr) : new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const events: UnifiedCalendarEvent[] = [];

    // 1. Fetch Scheduled Meetings
    try {
      // Host OR attendee — a shared meeting must show up on every real
      // participant's calendar ("interconnected"), not just the host's.
      const meetings = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "MeetingSchedule"
         WHERE "scheduledAt" >= $1 AND "scheduledAt" <= $2 AND status != 'CANCELLED'
           AND ("hostId" = $3 OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(attendees, '[]'::jsonb)) elem
             WHERE lower(elem->>'email') = lower($4)
           ))
         ORDER BY "scheduledAt" ASC`,
        rangeStart,
        rangeEnd,
        employeeId,
        viewerEmail || ""
      );

      for (const m of meetings) {
        const start = new Date(m.scheduledAt);
        const end = new Date(start.getTime() + (m.durationMinutes || 30) * 60 * 1000);

        events.push({
          id: "meeting-" + m.id,
          title: m.title,
          type: "MEETING",
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          allDay: false,
          status: m.status,
          joinUrl: m.meetingUrl || undefined,
          location: m.platform,
          attendees: Array.isArray(m.attendees) ? (m.attendees as any) : [],
          associatedEntity: m.taskId
            ? { type: "TASK", id: m.taskId, label: m.title }
            : m.projectId
            ? { type: "PROJECT", id: m.projectId, label: "Project Sync" }
            : m.clientId
            ? { type: "CLIENT", id: m.clientId, label: "Client Meeting" }
            : undefined,
        });
      }
    } catch (e: any) {
      console.error("Error fetching meetings:", e);
    }

    // 2. Fetch Tasks with Due Dates
    if (!filterType || filterType === "TASK" || filterType === "ALL") {
      // Viewing your own calendar: your assigned/created tasks, plus your
      // whole department's board if your role gets that (same rule as the
      // rest of the app — see scopedTaskWhere). Leadership explicitly
      // viewing a specific other employee's calendar just sees that
      // employee's own tasks, not a second department expansion.
      let taskWhere: any = {
        dueDate: { gte: rangeStart, lte: rangeEnd },
        deletedAt: null,
        OR: [{ assigneeId: employeeId }, { creatorId: employeeId }],
      };
      if (!(canViewOthers && requestedEmployeeId)) {
        const deptScope: any = await scopedTaskWhere(session as any);
        if (Array.isArray(deptScope.OR)) {
          taskWhere.OR = [...taskWhere.OR, ...deptScope.OR];
        } else if (deptScope.departmentId) {
          taskWhere.OR = [...taskWhere.OR, { departmentId: deptScope.departmentId }];
        }
      }

      const tasks = await prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 500,
      });

      for (const t of tasks) {
        if (!t.dueDate) continue;
        const due = new Date(t.dueDate);
        events.push({
          id: "task-" + t.id,
          title: "[Due] " + t.title,
          type: "TASK_DEADLINE",
          startTime: due.toISOString(),
          endTime: new Date(due.getTime() + 60 * 60 * 1000).toISOString(),
          allDay: true,
          status: t.status,
          priority: t.priority,
          url: "/tasks?task=" + t.id,
          associatedEntity: {
            type: "TASK",
            id: t.id,
            label: t.title,
          },
        });
      }
    }


    // 3. Personal iCal feed (manual, read-only sync — no OAuth required)
    if ((!filterType || filterType === "ALL" || filterType === "PERSONAL_CALENDAR") && employeeId) {
      try {
        const icalIntegration = await (prisma as any).employeeIntegration.findUnique({
          where: { employeeId_provider: { employeeId, provider: "ICAL" } },
        });
        if (icalIntegration?.isActive && icalIntegration.icalUrl) {
          const icsEvents = await fetchIcsEvents(icalIntegration.icalUrl, rangeStart, rangeEnd);
          for (const e of icsEvents) {
            events.push({
              id: "ical-" + e.uid,
              title: e.title,
              type: "PERSONAL_CALENDAR",
              startTime: e.start.toISOString(),
              endTime: e.end.toISOString(),
              allDay: e.allDay,
              status: "SCHEDULED",
              location: e.location,
            });
          }
        }
      } catch (e: any) {
        console.error("Error fetching personal iCal feed:", e);
      }
    }

    events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return NextResponse.json({ ok: true, data: events });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed to fetch calendar events" }, { status: 500 });
  }
}
