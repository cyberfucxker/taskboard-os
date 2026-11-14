import { NextResponse } from "next/server";
import { z } from "zod";
import { makeApproval, makeFollowUps } from "@/lib/salesEngine";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("sales.engine.manage");
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: (err as { status?: number }).status ?? 401 }
    );
  }
  try {

    return NextResponse.json({ ok: true, approval: makeApproval(), followUps: makeFollowUps(84, true) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

const dispatch = z.object({ channel: z.enum(["WhatsApp", "Email"]).default("WhatsApp") });

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

    const body = dispatch.parse(await req.json());
    return NextResponse.json({
      ok: true,
      simulated: true,
      delivered: false,
      channel: body.channel,
      note: "Simulation only. No WhatsApp or email provider is configured, so nothing was sent.",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}