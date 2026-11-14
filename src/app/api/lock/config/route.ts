import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_PAGE = /^[a-z0-9-]{1,40}$/;

const schema = z.object({
  enabledPages: z.array(z.string().regex(VALID_PAGE)).max(40),
  pin: z.string().regex(/^\d{4,8}$/).nullable().optional(),
});

/**
 * Self-scoped: any employee can configure THEIR OWN panel-lock veil.
 * The PIN is hashed with bcrypt before storage — it used to be stored as
 * plaintext in Employee.panelLock, readable by anyone with DB/console
 * access, which defeated the one guarantee this "veil" feature claims.
 */
export async function POST(req: Request) {
  const session = await requireRole("workspace.access");
  const body = await req.json().catch(() => ({}));
  const parsed = schema.parse(body);

  const current = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { panelLock: true },
  });
  const prev = ((current?.panelLock as any) ?? {}) as { enabledPages?: string[]; pinHash?: string };

  await prisma.employee.update({
    where: { id: session.user.id },
    data: {
      panelLock: {
        enabledPages: parsed.enabledPages,
        // empty/blank pin → keep existing hash; else hash and store the new one
        pinHash: parsed.pin ? await bcrypt.hash(parsed.pin, 10) : prev.pinHash ?? null,
      },
    },
  });
  return NextResponse.json({ ok: true, enabledPages: parsed.enabledPages });
}
