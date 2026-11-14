import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { effectiveCapsForSession, scopedTaskWhere, scopedClientWhere, scopedProjectWhere } from "@/lib/scope";
import { canOpenCourse } from "@/lib/lms";

export const dynamic = "force-dynamic";

export interface SearchResultItem {
  id: string;
  label: string;
  sublabel?: string;
}

export interface SearchResults {
  tasks: SearchResultItem[];
  clients: SearchResultItem[];
  projects: SearchResultItem[];
  people: SearchResultItem[];
  courses: SearchResultItem[];
}

const TAKE = 8;

/**
 * GET /api/search?q=... — one query box for the whole app. Every section is
 * scoped exactly like its own page would scope it (scopedTaskWhere for tasks,
 * directory.view for people, lms.view + canOpenCourse for courses) so search
 * never surfaces something the viewer couldn't already see on that entity's
 * own page.
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole("workspace.access");
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json({ ok: true, results: emptyResults() });

    const caps = await effectiveCapsForSession(session);
    const contains = { contains: q, mode: "insensitive" as const };

    const [taskWhere, clientWhere, projectWhere] = await Promise.all([
      scopedTaskWhere(session),
      scopedClientWhere(session),
      scopedProjectWhere(session),
    ]);

    const [tasks, clients, projects, people, courses] = await Promise.all([
      prisma.task.findMany({
        where: { deletedAt: null, AND: [ Object.keys(taskWhere).length > 0 ? taskWhere : {}, { OR: [{ title: contains }, { code: contains }, { description: contains }] } ] },
        select: { id: true, code: true, title: true },
        orderBy: { title: "asc" },
        take: TAKE,
      }),
      prisma.client.findMany({
        where: { deletedAt: null, ...clientWhere, name: contains },
        select: { id: true, name: true, industry: true },
        orderBy: { name: "asc" },
        take: TAKE,
      }),
      prisma.project.findMany({
        where: { deletedAt: null, ...projectWhere, name: contains },
        select: { id: true, name: true, client: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: TAKE,
      }),
      caps.has("directory.view")
        ? prisma.employee.findMany({
            where: { deletedAt: null, name: contains },
            select: { id: true, name: true, title: true },
            orderBy: { name: "asc" },
            take: TAKE,
          })
        : Promise.resolve([]),
      caps.has("lms.view")
        ? prisma.course.findMany({
            where: { deletedAt: null, status: "PUBLISHED", title: contains },
            select: { id: true, title: true, department: true },
            orderBy: { title: "asc" },
            take: TAKE,
          })
        : Promise.resolve([]),
    ]);

    const openableCourses = courses.filter((c) => canOpenCourse(c, session)).slice(0, TAKE);

    const results: SearchResults = {
      tasks: tasks.map((t) => ({ id: t.id, label: t.title, sublabel: t.code })),
      clients: clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.industry ?? undefined })),
      projects: projects.map((p) => ({ id: p.id, label: p.name, sublabel: p.client?.name })),
      people: people.map((e) => ({ id: e.id, label: e.name, sublabel: e.title ?? undefined })),
      courses: openableCourses.map((c) => ({ id: c.id, label: c.title, sublabel: c.department ?? undefined })),
    };

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

function emptyResults(): SearchResults {
  return { tasks: [], clients: [], projects: [], people: [], courses: [] };
}
