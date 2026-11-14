import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/resources/[id] — update a resource (used for re-pin, edit).
 */
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  departmentSlug: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  linkType: z.enum([
    "DRIVE_LINK",
    "GOOGLE_SHEET",
    "NOTION_DOC",
    "FIGMA",
    "API_PORTAL",
    "SOP_GUIDE",
    "CREDENTIAL_BOOKMARK",
  ]).optional(),
  url: z.string().optional(),
  description: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().max(40)).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole("tasks.manage");
    const body = patchSchema.parse(await req.json());

    // Resource must exist and not be deleted.
    const existing = await prisma.departmentResource.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Resource not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.department !== undefined) data.department = body.department;
    if (body.departmentSlug !== undefined) data.departmentSlug = body.departmentSlug;
    if (body.linkType !== undefined) data.linkType = body.linkType;
    if (body.url !== undefined) data.url = body.url;
    if (body.description !== undefined) data.description = body.description;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.pinned !== undefined) data.pinned = body.pinned;
    if (session.user.name) data.addedByName = session.user.name;

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    const resource = await prisma.departmentResource.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true, resource });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

/**
 * DELETE /api/resources/[id] — soft-delete a resource link.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("tasks.manage");
    const existing = await prisma.departmentResource.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Resource not found" }, { status: 404 });

    await prisma.departmentResource.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}