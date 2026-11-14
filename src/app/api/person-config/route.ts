import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { effectiveCapsForSession } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const requestedEmployeeId = searchParams.get("employeeId");
    // A caller may only ever request their OWN PersonConfig here unless they
    // hold the same leadership capability that already gates `scope=all`
    // below — otherwise any employee could read another employee's targets,
    // focus areas and client list just by knowing their id (trivially found
    // via the Directory page, which nearly every role can open).
    let employeeId = session.user.id;
    if (requestedEmployeeId && requestedEmployeeId !== session.user.id) {
      const requesterCaps = await effectiveCapsForSession(session as any);
      if (!requesterCaps.has("board.view") && !requesterCaps.has("hrms.manage")) {
        return NextResponse.json({ ok: false, error: "Forbidden — your access does not cover this" }, { status: 403 });
      }
      employeeId = requestedEmployeeId;
    }
    // `moduleType` is each employee's own operational-module identifier
    // (e.g. "HR_OPERATIONS_LEAD"), not a fixed app-section enum — every real
    // employee has exactly one PersonConfig row, keyed by their own unique
    // moduleType. Only filter by it when a caller explicitly asks for one;
    // otherwise fetch whatever config that employee actually has.
    const explicitModuleType = searchParams.get("moduleType");

    const personConfig = await (prisma as any).personConfig.findFirst({
      where: explicitModuleType ? { employeeId, moduleType: explicitModuleType } : { employeeId },
      orderBy: { version: "desc" },
    });

    // Leadership-only: the "Role Operations & Departmental Workspaces" panel needs
    // every employee's latest config for the requested module. Gated on the same
    // capability that already means "sees across every department" elsewhere
    // (board.view / hrms.manage) — a regular employee never gets other people's configs.
    let allConfigs: any[] | undefined;
    if (searchParams.get("scope") === "all") {
      const caps = await effectiveCapsForSession(session as any);
      if (caps.has("board.view") || caps.has("hrms.manage")) {
        const employees = await prisma.employee.findMany({
          where: { status: { not: "EXITED" as any } },
          select: { id: true, name: true, email: true, role: true, department: { select: { name: true, slug: true } } },
        });
        const latestByEmployee = await (prisma as any).personConfig.findMany({
          orderBy: { version: "desc" },
        });
        const seen = new Set<string>();
        const latest: any[] = [];
        for (const cfg of latestByEmployee) {
          if (seen.has(cfg.employeeId)) continue;
          seen.add(cfg.employeeId);
          const emp = employees.find((e) => e.id === cfg.employeeId);
          if (!emp) continue;
          latest.push({
            ...cfg,
            employee: { name: emp.name, email: emp.email, role: emp.role },
            configJson: {
              ...(cfg.configJson as any),
              department: emp.department?.name ?? (cfg.configJson as any)?.department ?? "Unassigned",
            },
          });
        }
        allConfigs = latest;
      } else {
        allConfigs = [];
      }
    }

    return NextResponse.json({ ok: true, data: personConfig, allConfigs });
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
    const { employeeId: requestedEmployeeId, moduleType, configJson } = body;
    if (!moduleType) {
      return NextResponse.json({ ok: false, error: "moduleType is required" }, { status: 400 });
    }
    // Same boundary as GET: writing another employee's PersonConfig requires
    // the leadership capability, never just "you supplied their id".
    let employeeId = session.user.id;
    if (requestedEmployeeId && requestedEmployeeId !== session.user.id) {
      const requesterCaps = await effectiveCapsForSession(session as any);
      if (!requesterCaps.has("board.view") && !requesterCaps.has("hrms.manage")) {
        return NextResponse.json({ ok: false, error: "Forbidden — your access does not cover this" }, { status: 403 });
      }
      employeeId = requestedEmployeeId;
    }

    const latest = await (prisma as any).personConfig.findFirst({
      where: { employeeId, moduleType },
      orderBy: { version: "desc" },
    });

    const nextVersion = (latest?.version || 0) + 1;

    const created = await (prisma as any).personConfig.create({
      data: {
        employeeId,
        moduleType,
        configJson: configJson || {},
        version: nextVersion,
        effectiveFrom: new Date(),
      },
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
