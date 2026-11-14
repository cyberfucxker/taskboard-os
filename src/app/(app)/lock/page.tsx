import type { Metadata } from "next";
import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { LockConfigClient } from "@/components/lock/LockConfigClient";

export const metadata: Metadata = { title: "Lock panels" };
export const dynamic = "force-dynamic";

/** Per-employee lock config — accessible to ALL employees (workspace.access).
 *  Each employee picks which panels in their own TaskBoard to veil behind a PIN. */
export default async function LockPage() {
  const session = await guardPage("Lock");
  const me = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { panelLock: true },
  });
  const cfg = ((me?.panelLock as any) ?? null) as { enabledPages?: string[]; pin?: string } | null;
  return <LockConfigClient enabledPages={cfg?.enabledPages ?? []} hasPin={Boolean(cfg?.pin)} />;
}