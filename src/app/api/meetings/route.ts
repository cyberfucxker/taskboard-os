import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    const projectId = searchParams.get("projectId");
    const clientId = searchParams.get("clientId");
    const hostId = searchParams.get("hostId");
    const upcoming = searchParams.get("upcoming") === "true";
    const mine = searchParams.get("mine") === "true";
    const limitParam = parseInt(searchParams.get("limit") || "", 10);
    const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 50;

    let meetings: any[];
    if (mine) {
      // "Mine" = meetings I'm hosting OR meetings I was added to as an attendee
      // (attendees is a JSON array of {name, email}, so attendee membership needs
      // a JSON-aware match rather than a plain column filter).
      const scheduledFilter = upcoming ? `AND "scheduledAt" >= NOW() - INTERVAL '1 hour' AND status != 'CANCELLED'` : "";
      meetings = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "MeetingSchedule"
         WHERE ("hostId" = $1 OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(attendees, '[]'::jsonb)) elem
           WHERE lower(elem->>'email') = lower($2)
         )) ${scheduledFilter}
         ORDER BY "scheduledAt" ASC
         LIMIT $3`,
        session.user.id,
        session.user.email || "",
        take
      );
    } else {
      const where: any = {};
      if (taskId) where.taskId = taskId;
      if (projectId) where.projectId = projectId;
      if (clientId) where.clientId = clientId;
      if (hostId) where.hostId = hostId;
      if (upcoming) {
        where.scheduledAt = { gte: new Date(Date.now() - 3600000) };
        where.status = { not: "CANCELLED" };
      }

      meetings = await (prisma as any).meetingSchedule.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        take,
      });
    }

    {
      const r = (session.user as any).role;
      if (!(r === "SUPER_ADMIN" || r === "HR" || r === "DEPARTMENT_HEAD" || r === "TEAM_LEAD" || (session.user as any).departmentSlug === "leadership")) {
        const me = session.user.id;
        const myEmail = (session.user.email || "").toLowerCase();
        meetings = meetings.filter((m: any) => m.hostId === me ||
          (Array.isArray(m.attendees) && m.attendees.some((a: any) => myEmail && String(a?.email || "").toLowerCase() === myEmail)));
      }
    }

    const hostIds = Array.from(new Set(meetings.map((m: any) => m.hostId).filter(Boolean)));
    const clientIds = Array.from(new Set(meetings.map((m: any) => m.clientId).filter(Boolean)));
    const taskIds = Array.from(new Set(meetings.map((m: any) => m.taskId).filter(Boolean)));
    const projectIds = Array.from(new Set(meetings.map((m: any) => m.projectId).filter(Boolean)));

    const [hosts, clients, tasks, projects] = await Promise.all([
      hostIds.length ? prisma.employee.findMany({
        where: { id: { in: hostIds as string[] } },
        select: { id: true, name: true, email: true, title: true, role: true }
      }) : [],
      clientIds.length ? prisma.client.findMany({
        where: { id: { in: clientIds as string[] } },
        select: { id: true, name: true }
      }) : [],
      taskIds.length ? prisma.task.findMany({
        where: { id: { in: taskIds as string[] } },
        select: { id: true, title: true, status: true, priority: true }
      }) : [],
      projectIds.length ? prisma.project.findMany({
        where: { id: { in: projectIds as string[] } },
        select: { id: true, name: true }
      }) : []
    ]);

    const hostMap = new Map(hosts.map(h => [h.id, h]));
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    const enriched = meetings.map((m: any) => ({
      ...m,
      host: hostMap.get(m.hostId) || null,
      client: clientMap.get(m.clientId) || null,
      task: taskMap.get(m.taskId) || null,
      project: projectMap.get(m.projectId) || null,
      isHost: m.hostId === session.user.id,
    }));

    return NextResponse.json({ ok: true, data: enriched });
  } catch (err: any) {
    console.error("GET /api/meetings error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to fetch meetings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description,
      platform = "GOOGLE_MEET",
      scheduledAt,
      durationMinutes = 30,
      taskId,
      projectId,
      clientId,
      hostId = session.user.id,
      attendees = [],
      customMeetingUrl,
    } = body;

    if (!title || !scheduledAt) {
      return NextResponse.json({ ok: false, error: "Title and scheduled time are required" }, { status: 400 });
    }

    const schedDate = new Date(scheduledAt);

    // Look up the host's real personal link for the requested platform. We never
    // fabricate a meeting URL (a random-looking meet.google.com/xxx-yyyy-zzz or a
    // bare zoom.us/join is not a real, joinable meeting) — if no real link is on
    // file, meetingUrl stays empty and the UI tells the host to add one.
    let meetingUrl = customMeetingUrl?.trim() || "";
    if (!meetingUrl) {
      const providerForPlatform =
        platform === "ZOOM" ? "ZOOM" : platform === "MICROSOFT_TEAMS" ? "TEAMS" : "GOOGLE";
      const personalIntegration = await (prisma as any).employeeIntegration.findUnique({
        where: {
          employeeId_provider: {
            employeeId: hostId,
            provider: providerForPlatform,
          },
        },
      });
      meetingUrl = personalIntegration?.personalMeetUrl || "";
    }

    const meeting = await (prisma as any).meetingSchedule.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        platform: platform,
        meetingUrl,
        scheduledAt: schedDate,
        durationMinutes: parseInt(String(durationMinutes), 10) || 30,
        status: "SCHEDULED",
        hostId,
        taskId: taskId || null,
        projectId: projectId || null,
        clientId: clientId || null,
        attendees: Array.isArray(attendees) ? attendees : [],
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Meeting scheduled successfully",
      data: meeting,
    });
  } catch (err: any) {
    console.error("POST /api/meetings error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to schedule meeting" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, notes, recordingUrl, meetingUrl, scheduledAt, durationMinutes } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Meeting ID is required" }, { status: 400 });
    }

    // Only the host may reschedule/cancel/edit their own meeting — without
    // this, any logged-in employee could modify or cancel anyone else's
    // meeting just by knowing its id.
    const existing = await (prisma as any).meetingSchedule.findUnique({ where: { id }, select: { hostId: true } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
    }
    if (existing.hostId !== session.user.id) {
      return NextResponse.json({ ok: false, error: "Only the host can update this meeting" }, { status: 403 });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (recordingUrl !== undefined) updateData.recordingUrl = recordingUrl;
    if (meetingUrl !== undefined) updateData.meetingUrl = meetingUrl;
    if (scheduledAt) updateData.scheduledAt = new Date(scheduledAt);
    if (durationMinutes) updateData.durationMinutes = parseInt(String(durationMinutes), 10);

    const updated = await (prisma as any).meetingSchedule.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err: any) {
    console.error("PATCH /api/meetings error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to update meeting" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing meeting id" }, { status: 400 });
    }

    const existing = await (prisma as any).meetingSchedule.findUnique({ where: { id }, select: { hostId: true } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
    }
    if (existing.hostId !== session.user.id) {
      return NextResponse.json({ ok: false, error: "Only the host can cancel this meeting" }, { status: 403 });
    }

    await (prisma as any).meetingSchedule.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, message: "Meeting deleted successfully" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed to delete meeting" }, { status: 500 });
  }
}
