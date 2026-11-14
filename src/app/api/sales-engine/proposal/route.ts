import { NextResponse } from "next/server";
import { z } from "zod";
import { buildProposal } from "@/lib/salesEngine";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  region: z.enum(["US", "IN"]).default("US"),
  marginPct: z.number().min(10).max(45).default(25),
  teamSize: z.number().int().min(2).max(8).default(3),
});

export async function POST(req: Request) {
  try {
    await requireRole("sales.engine.manage");
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: (err as { status?: number }).status ?? 401 }
    );
  }
  try {

    const body = schema.parse(await req.json());
    return NextResponse.json({ ok: true, proposal: buildProposal(body.region, body.marginPct, body.teamSize) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}