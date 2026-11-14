import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/catalog — lightweight client/project/service/employee/department options
 * for task creation and drawer pickers across the app.
 */
export async function GET() {
  try {
    await requireRole("tasks.view");
    const [clients, projects, services, employees, departments] = await Promise.all([
      prisma.client.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, category: true, clientId: true },
        orderBy: { name: "asc" },
      }),
      prisma.service.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, category: true },
        orderBy: { name: "asc" },
      }),
      prisma.employee.findMany({
        where: { status: { in: ["ACTIVE", "PROBATION"] }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json({ ok: true, clients, projects, services, employees, departments });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}