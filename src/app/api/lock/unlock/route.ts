import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({ pin: z.string() });

/** Verify the caller's OWN panel PIN against its bcrypt hash. Returns ok — the client gates locally. */
export async function POST(req: Request) {
  const session = await requireRole("workspace.access");
  const body = await req.json().catch(() => ({}));
  const { pin } = schema.parse(body);

  const me = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { panelLock: true },
  });
  const cfg = ((me?.panelLock as any) ?? null) as { pinHash?: string; pin?: string } | null;
  if (!cfg?.pinHash && !cfg?.pin) {
    return NextResponse.json({ ok: false, error: "No PIN set" }, { status: 400 });
  }

  // Back-compat: an old plaintext pin (pre-hashing) still verifies once, then
  // gets silently upgraded to a hash so it's never stored in the clear again.
  if (!cfg.pinHash && cfg.pin) {
    if (cfg.pin !== pin) {
      return NextResponse.json({ ok: false, error: "Wrong PIN" }, { status: 401 });
    }
    await prisma.employee.update({
      where: { id: session.user.id },
      data: { panelLock: { ...(me?.panelLock as any), pinHash: await bcrypt.hash(pin, 10), pin: undefined } },
    });
    return NextResponse.json({ ok: true });
  }

  const match = await bcrypt.compare(pin, cfg.pinHash!);
  if (!match) {
    return NextResponse.json({ ok: false, error: "Wrong PIN" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
