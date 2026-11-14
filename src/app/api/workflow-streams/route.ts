import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_ICONS = [
  "PhoneCall", "FileText", "Users", "TrendingUp", "Search", "Palette",
  "Layers", "Code2", "AlertOctagon", "BarChart3", "Sparkles", "CheckCircle2",
  "Send", "Target", "Globe", "Video", "Clock",
];

/**
 * Every employee's Development Workflows / quick-timer list is strictly
 * their own — never shared with, or editable by, anyone else in their
 * department (including leadership). Each person's list is seeded once from
 * their department's default set, then is entirely self-service from there.
 */

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const streams = await (prisma as any).workflowStream.findMany({
      where: { employeeId: session.user.id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ ok: true, data: streams });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { title, category, icon = "Sparkles", colorHex = "#3E8B93" } = body;
    if (!title?.trim() || !category?.trim()) {
      return NextResponse.json({ ok: false, error: "Title and category are required" }, { status: 400 });
    }
    const safeIcon = ALLOWED_ICONS.includes(icon) ? icon : "Sparkles";
    const key = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || `stream-${Date.now()}`;

    const count = await (prisma as any).workflowStream.count({ where: { employeeId: session.user.id } });
    const created = await (prisma as any).workflowStream.create({
      data: {
        employeeId: session.user.id,
        departmentSlug: session.user.departmentSlug ?? null,
        key: `${key}-${Date.now().toString(36)}`,
        title: title.trim(),
        category: category.trim().toUpperCase(),
        icon: safeIcon,
        colorHex,
        sortOrder: count,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { id, title, category, icon, colorHex } = body;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const existing = await (prisma as any).workflowStream.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (existing.employeeId !== session.user.id) {
      return NextResponse.json({ ok: false, error: "You can only manage your own workflows" }, { status: 403 });
    }
    const data: any = {};
    if (title?.trim()) data.title = title.trim();
    if (category?.trim()) data.category = category.trim().toUpperCase();
    if (icon && ALLOWED_ICONS.includes(icon)) data.icon = icon;
    if (colorHex) data.colorHex = colorHex;

    const updated = await (prisma as any).workflowStream.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }
    const existing = await (prisma as any).workflowStream.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (existing.employeeId !== session.user.id) {
      return NextResponse.json({ ok: false, error: "You can only manage your own workflows" }, { status: 403 });
    }
    await (prisma as any).workflowStream.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
