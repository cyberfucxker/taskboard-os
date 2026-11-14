import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emitEvent } from "@/lib/eventlog";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the host's real personal meeting link for a platform. Never
 * fabricates a URL (a random meet.google.com/xxx-yyyy-zzz or zoom.us/j/<fake id>
 * is not a real, joinable meeting) — returns "" when nothing real is on file,
 * so the UI can say so instead of pretending a link works.
 */
async function generateMeetingUrl(platform: string, hostEmployeeId: string): Promise<string> {
  const provider = platform === "ZOOM" ? "ZOOM" : platform === "TEAMS" ? "TEAMS" : "GOOGLE";
  const integration = await prisma.employeeIntegration.findFirst({
    where: { employeeId: hostEmployeeId, provider, isActive: true },
    select: { personalMeetUrl: true },
  });
  return integration?.personalMeetUrl || "";
}

/** Calculate all occurrence dates for a cadence between startDate and endDate. */
function buildMeetingDates(
  startDate: Date,
  endDate: Date,
  frequency: string,
  dayOfWeek: number,
  time: string
): Date[] {
  const dates: Date[] = [];
  const [hh, mm] = (time || "09:00").split(":").map(Number);

  let cursor = new Date(startDate);
  cursor.setHours(hh, mm, 0, 0);

  if (frequency !== "monthly") {
    while (cursor.getDay() !== dayOfWeek) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    if (frequency === "monthly") {
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      const stepDays = frequency === "weekly" ? 7 : 14;
      cursor.setDate(cursor.getDate() + stepDays);
    }
  }
  return dates;
}

/** Send a WhatsApp notification, or log if not configured. */
async function sendWhatsAppNotification(
  phone: string,
  message: string
): Promise<{ queued: boolean; reason?: string }> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log(`[WhatsApp] ${phone}: ${message}`);
    return { queued: true, reason: "WhatsApp not configured" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body: message },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(`[WhatsApp] API error: ${err}`);
      return { queued: false, reason: err };
    }
    return { queued: true };
  } catch (e) {
    console.error(`[WhatsApp] fetch failed:`, e);
    return { queued: false, reason: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const meetingCadenceSchema = z.object({
  frequency: z.enum(["none", "weekly", "biweekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMinutes: z.number().int().positive().optional(),
  platform: z.enum(["GOOGLE_MEET", "ZOOM", "TEAMS", "IN_PERSON"]).optional(),
  attendeeIds: z.array(z.string()).optional(),
});

const schema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullish(),
  ownerId: z.string().nullish(),
  startDate: z.string().datetime({ offset: true }).nullish(),
  endDate: z.string().datetime({ offset: true }).nullish(),
  meetingCadence: meetingCadenceSchema.optional(),
});

// ---------------------------------------------------------------------------
// GET /api/projects
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  try {
    const session = await requireRole("tasks.view");
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined;

    const where: any = { deletedAt: null };
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, tier: true, status: true } },
        owner: { select: { id: true, name: true, role: true } },
        tasks: {
          where: { deletedAt: null },
          select: { id: true, status: true, priority: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ ok: true, projects });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const body = schema.parse(await req.json());

    const project = await prisma.project.create({
      data: {
        clientId: body.clientId,
        name: body.name,
        category: body.category ?? null,
        ownerId: body.ownerId ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      include: {
        client: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    await emitEvent({
      type: "PROJECT_CREATED",
      actorId: session.user.id,
      entityType: "project",
      entityId: project.id,
      clientId: project.clientId,
      payload: { v: 1, name: project.name, clientId: project.clientId },
    });

    // -----------------------------------------------------------------------
    // Meeting cadence — schedule recurring meetings for this project
    // -----------------------------------------------------------------------
    const cadence = body.meetingCadence;
    let meetings: any[] = [];

    if (cadence && cadence.frequency !== "none") {
      const startDate = body.startDate ? new Date(body.startDate) : new Date();
      const endDate = body.endDate
        ? new Date(body.endDate)
        : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);

      const platform = cadence.platform ?? "GOOGLE_MEET";
      const hostId = body.ownerId ?? session.user.id;
      const durationMinutes = cadence.durationMinutes ?? 30;
      const attendeeIds = cadence.attendeeIds ?? [];

      const meetingUrl =
        platform === "IN_PERSON"
          ? "In Person"
          : await generateMeetingUrl(platform, hostId);

      const dates = buildMeetingDates(
        startDate,
        endDate,
        cadence.frequency,
        cadence.dayOfWeek ?? 1,
        cadence.time ?? "09:00"
      );

      const cadenceLabel =
        cadence.frequency.charAt(0).toUpperCase() + cadence.frequency.slice(1);

      meetings = await Promise.all(
        dates.map((scheduledAt) =>
          prisma.meetingSchedule.create({
            data: {
              title: `${project.name} — ${cadenceLabel} Sync`,
              platform,
              meetingUrl,
              scheduledAt,
              durationMinutes,
              hostId,
              clientId: project.clientId,
              projectId: project.id,
              attendees: attendeeIds,
            },
          })
        )
      );

      // WhatsApp notifications — fire-and-forget
      if (attendeeIds.length > 0) {
        const employees = await prisma.employee.findMany({
          where: { id: { in: attendeeIds } },
          select: { id: true, name: true, personalPhone: true },
        });

        for (const emp of employees) {
          if (emp.personalPhone) {
            const firstDate = dates[0];
            const msg =
              `Hi ${emp.name}! You have been added to recurring meetings for project "${project.name}". ` +
              `First session: ${firstDate.toLocaleDateString("en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })} at ${cadence.time ?? "09:00"}. ` +
              (platform !== "IN_PERSON" ? `Join: ${meetingUrl}` : "Venue: In Person");
            sendWhatsAppNotification(emp.personalPhone, msg).catch(() => {});
          }
        }
      }
    }

    return NextResponse.json({ ok: true, project, meetings });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}
