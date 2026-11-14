import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { effectiveCapsForSession } from "@/lib/scope";
import {
  endBlock,
  FocusBlockError,
  getOpenBlock,
  startBlock,
  switchActive,
} from "@/lib/focus";

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  taskIds?: unknown;
  taskId?: unknown;
  choices?: unknown;
};

/**
 * GET  /api/focus — the caller's open focus block (null when none).
 * POST /api/focus — { action: "start" | "switch" | "end" }
 *
 * T8. The block is per-employee, so this route is always the caller's own block;
 * there is no cross-tenant read here by construction. Task-level access is enforced
 * in focus.ts with the same guard startWork uses, never in this file.
 */
export async function GET() {
  try {
    const session = await requireRole("workspace.access");
    const block = await getOpenBlock(session.user.id);
    return NextResponse.json({ ok: true, block });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole("workspace.access");
    const caps = await effectiveCapsForSession(session);
    const body = (await request.json().catch(() => ({}))) as Body;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "start") {
      const block = await startBlock(body.taskIds, session.user.id, caps);
      return NextResponse.json({ ok: true, block });
    }
    if (action === "switch") {
      if (typeof body.taskId !== "string" || !body.taskId) {
        return NextResponse.json({ ok: false, error: "taskId is required." }, { status: 400 });
      }
      const block = await switchActive(body.taskId, session.user.id, caps);
      return NextResponse.json({ ok: true, block });
    }
    if (action === "end") {
      const choices =
        body.choices && typeof body.choices === "object"
          ? (body.choices as Record<string, never>)
          : null;
      const result = await endBlock(session.user.id, caps, choices);
      return NextResponse.json({ ok: true, block: null, result });
    }

    return NextResponse.json(
      { ok: false, error: 'action must be one of "start", "switch", "end".' },
      { status: 400 }
    );
  } catch (err) {
    const status =
      err instanceof FocusBlockError ? err.status : ((err as { status?: number }).status ?? 500);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}