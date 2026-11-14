import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Per-Employee Integrations API:
 * Allows each team member (or Admin/Leadership) to configure personal:
 * - Google Meet personal static room URL
 * - Calendly / Cal.com booking link
 * - Direct WhatsApp number for notifications
 * - Custom provider configurations
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetEmployeeId = searchParams.get("employeeId") || session.user.id;

    const isOwner = targetEmployeeId === session.user.id;
    const isOrgWideLeadership = ["SUPER_ADMIN", "ADMIN", "HR"].includes(session.user.role);
    const isDeptLead = ["DEPARTMENT_HEAD", "TEAM_LEAD"].includes(session.user.role);

    if (!isOwner && !isOrgWideLeadership) {
      // A department head / team lead sees personal integrations for their
      // OWN department only — not every employee org-wide.
      if (!isDeptLead || !session.user.departmentId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const target = await prisma.employee.findUnique({
        where: { id: targetEmployeeId },
        select: { departmentId: true },
      });
      if (target?.departmentId !== session.user.departmentId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const integrations = await (prisma as any).employeeIntegration.findMany({
      where: { employeeId: targetEmployeeId },
      orderBy: { provider: "asc" }
    });

    // Map Prisma field names to API response names for backward compatibility
    const mapped = integrations.map((i: any) => ({
      ...i,
      bookingUrl: i.calendlyUrl,
      whatsappNumber: i.whatsappPhone,
      isEnabled: i.isActive,
      metadata: i.settings,
    }));

    return NextResponse.json({ ok: true, data: mapped });
  } catch (err: any) {
    console.error("GET /api/integrations/employee error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to fetch integrations" }, { status: 500 });
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
      employeeId = session.user.id,
      provider,
      personalMeetUrl,
      icalUrl,
      bookingUrl,       // API input name → maps to calendlyUrl in Prisma
      whatsappNumber,   // API input name → maps to whatsappPhone in Prisma
      accountEmail,
      accessToken,
      refreshToken,
      isEnabled = true, // API input name → maps to isActive in Prisma
      metadata = {},    // API input name → maps to settings in Prisma
    } = body;

    if (!provider) {
      return NextResponse.json({ ok: false, error: "Provider is required (e.g. GOOGLE, CALENDLY, WHATSAPP)" }, { status: 400 });
    }

    const isOwner = employeeId === session.user.id;
    const isLeadership = ["SUPER_ADMIN", "ADMIN", "HR"].includes(session.user.role);

    if (!isOwner && !isLeadership) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const upserted = await (prisma as any).employeeIntegration.upsert({
      where: {
        employeeId_provider: {
          employeeId,
          provider: provider.toUpperCase(),
        },
      },
      update: {
        personalMeetUrl: personalMeetUrl !== undefined ? personalMeetUrl : undefined,
        icalUrl: icalUrl !== undefined ? icalUrl : undefined,
        calendlyUrl: bookingUrl !== undefined ? bookingUrl : undefined,
        whatsappPhone: whatsappNumber !== undefined ? whatsappNumber : undefined,
        accountEmail: accountEmail !== undefined ? accountEmail : undefined,
        accessToken: accessToken !== undefined ? accessToken : undefined,
        refreshToken: refreshToken !== undefined ? refreshToken : undefined,
        isActive: Boolean(isEnabled),
        settings: metadata || {},
        updatedAt: new Date(),
      },
      create: {
        employeeId,
        provider: provider.toUpperCase(),
        personalMeetUrl: personalMeetUrl || null,
        icalUrl: icalUrl || null,
        calendlyUrl: bookingUrl || null,
        whatsappPhone: whatsappNumber || null,
        accountEmail: accountEmail || null,
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        isActive: Boolean(isEnabled),
        settings: metadata || {},
      },
    });

    // Return response with API names for backward compatibility
    const response = {
      ...upserted,
      bookingUrl: upserted.calendlyUrl,
      whatsappNumber: upserted.whatsappPhone,
      isEnabled: upserted.isActive,
      metadata: upserted.settings,
    };

    return NextResponse.json({
      ok: true,
      message: `${provider} integration saved successfully`,
      data: response,
    });
  } catch (err: any) {
    console.error("POST /api/integrations/employee error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Failed to save integration" }, { status: 500 });
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
    const employeeId = searchParams.get("employeeId");
    const provider = searchParams.get("provider");

    if (id) {
      await (prisma as any).employeeIntegration.delete({ where: { id } });
      return NextResponse.json({ ok: true, message: "Integration removed" });
    }

    if (employeeId && provider) {
      await (prisma as any).employeeIntegration.deleteMany({
        where: {
          employeeId,
          provider: provider.toUpperCase(),
        },
      });
      return NextResponse.json({ ok: true, message: "Integration removed" });
    }

    return NextResponse.json({ ok: false, error: "Missing id or employeeId and provider" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed to delete integration" }, { status: 500 });
  }
}
