import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/resources — list all live department resources. Pinned items sort
 * first, then newest. Cross-vault search (search=), department filter
 * (departmentSlug=) and link-type filter (linkType=) are optional.
 */
export async function GET(req: Request) {
  try {
    await requireRole("tasks.view");
    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim();
    const departmentSlug = url.searchParams.get("departmentSlug")?.trim();
    const linkType = url.searchParams.get("linkType")?.trim();

    const where: {
      deletedAt?: null;
      departmentSlug?: string;
      linkType?: never;
      OR?: {
        title?: { contains: string; mode: "insensitive" };
        description?: { contains: string; mode: "insensitive" };
        department?: { contains: string; mode: "insensitive" };
        tags?: { has: string };
        url?: { contains: string; mode: "insensitive" };
      }[];
    } = { deletedAt: null };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { department: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
        { url: { contains: search, mode: "insensitive" } },
      ];
    }
    if (departmentSlug && departmentSlug !== "all") where.departmentSlug = departmentSlug;
    if (linkType && linkType !== "all") where.linkType = linkType as never;

    const resources = await prisma.departmentResource.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ ok: true, resources });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  departmentSlug: z.string().min(1),
  department: z.string().min(1),
  linkType: z.enum([
    "DRIVE_LINK",
    "GOOGLE_SHEET",
    "NOTION_DOC",
    "FIGMA",
    "API_PORTAL",
    "SOP_GUIDE",
    "CREDENTIAL_BOOKMARK",
  ]).default("DRIVE_LINK"),
  url: z.string().url().or(z.string().min(3)),
  description: z.string().max(1000).optional().nullable(),
  tags: z.array(z.string().max(40)).optional().default([]),
  pinned: z.boolean().optional().default(false),
});

/**
 * POST /api/resources — add a new resource link to a department vault.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("tasks.manage");
    const body = await req.json();
    const input = createSchema.parse(body);

    const resource = await prisma.departmentResource.create({
      data: {
        title: input.title,
        departmentSlug: input.departmentSlug,
        department: input.department,
        linkType: input.linkType,
        url: input.url,
        description: input.description ?? null,
        tags: input.tags,
        pinned: input.pinned,
        addedById: session.user.id,
        addedByName: session.user.name ?? null,
      },
    });

    return NextResponse.json({ ok: true, resource });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}