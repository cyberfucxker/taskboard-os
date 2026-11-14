import Link from "next/link";
import type { ReactNode } from "react";
import { AlarmClock, Bell, CircleCheck, GitPullRequest, OctagonX } from "lucide-react";
import { prisma } from "@/lib/db";
import { PingButton } from "./PingButton";
import { fmtDay } from "@/components/dept/ui";

/** Start of today in IST, as a UTC Date. */
function istDayStart(now = new Date()) {
  const IST = 5.5 * 3600 * 1000;
  const d = new Date(now.getTime() + IST);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST);
}

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

interface Item { key: string; icon: ReactNode; title: string; meta: string; href: string; pingId?: string }

/**
 * "Needs you": things that wait on this person, in one list.
 * Overdue + blocked work, reviews of tasks they handed out, approvals they own, unread alerts.
 */
export async function NeedsYou({ userId }: { userId: string }) {
  const dayStart = istDayStart();
  const taskSelect = { id: true, code: true, title: true, dueDate: true, client: { select: { name: true } } } as const;

  const [overdue, blocked, reviews, approvals, alerts] = await Promise.all([
    safe(() => prisma.task.findMany({
      // Missed routine instances belong to "My routines", not here.
      where: { assigneeId: userId, deletedAt: null, status: { not: "DONE" }, dueDate: { lt: dayStart }, NOT: { title: { startsWith: "Routine: " } } },
      orderBy: { dueDate: "asc" }, take: 5, select: taskSelect,
    })),
    safe(() => prisma.task.findMany({
      where: { assigneeId: userId, deletedAt: null, status: "BLOCKED", OR: [{ dueDate: null }, { dueDate: { gte: dayStart } }] },
      orderBy: { updatedAt: "asc" }, take: 3, select: taskSelect,
    })),
    safe(() => prisma.task.findMany({
      where: { creatorId: userId, deletedAt: null, status: "IN_REVIEW", NOT: { assigneeId: userId } },
      orderBy: { updatedAt: "asc" }, take: 5,
      select: { ...taskSelect, updatedAt: true, assignee: { select: { name: true } } },
    })),
    safe(() => prisma.approval.findMany({
      where: { ownerId: userId, status: "PENDING" },
      orderBy: { createdAt: "asc" }, take: 5,
      select: { id: true, entityType: true, stage: true, createdAt: true, client: { select: { name: true } } },
    })),
    safe(() => prisma.notification.findMany({
      where: { employeeId: userId, read: false },
      orderBy: { createdAt: "desc" }, take: 4,
      select: { id: true, title: true, createdAt: true },
    })),
  ]);

  const items: Item[] = [
    ...overdue.map((t) => ({
      key: `o${t.id}`, icon: <AlarmClock size={16} className="text-crimson" aria-label="Overdue" />,
      title: `Overdue: ${t.code} ${t.title}`, meta: [t.client?.name, `due ${fmtDay(t.dueDate)}`].filter(Boolean).join(" · "), href: `/tasks/${t.id}`,
    })),
    ...blocked.map((t) => ({
      key: `b${t.id}`, icon: <OctagonX size={16} className="text-crimson" aria-label="Blocked" />,
      title: `Blocked: ${t.code} ${t.title}`, meta: t.client?.name ?? "", href: `/tasks/${t.id}`, pingId: t.id,
    })),
    ...reviews.map((t) => ({
      key: `r${t.id}`, icon: <GitPullRequest size={16} className="text-amber" aria-label="Review" />,
      title: `Review: ${t.code} ${t.title}`, meta: [t.assignee?.name, ago(t.updatedAt)].filter(Boolean).join(" · "), href: `/tasks/${t.id}`,
    })),
    ...approvals.map((a) => ({
      key: `a${a.id}`, icon: <CircleCheck size={16} className="text-tealhi" aria-label="Approval" />,
      title: `Approve: ${a.entityType} · ${a.stage}`, meta: [a.client?.name, ago(a.createdAt)].filter(Boolean).join(" · "), href: "/inbox",
    })),
    ...alerts.map((n) => ({
      key: `n${n.id}`, icon: <Bell size={16} className="text-muted" aria-label="Alert" />,
      title: n.title, meta: ago(n.createdAt), href: "/inbox",
    })),
  ];

  return (
    <section aria-label="Needs you">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[12px] font-medium text-muted">
          Needs you {items.length > 0 && <span className="ml-1 text-ink2">{items.length}</span>}
        </h2>
        <Link href="/inbox" className="text-[12px] text-ink2 hover:text-tealhi">Inbox →</Link>
      </header>
      {items.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-muted">Nothing is waiting on you. Good.</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.key} className="border-b border-line last:border-b-0">
              <Link href={it.href} className="flex min-h-[40px] items-center gap-2.5 py-1.5 text-[13px] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]">
                <span className="flex-none">{it.icon}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{it.title}</span>
                {it.meta && <span className="hidden flex-none text-[12px] text-muted sm:inline">{it.meta}</span>}
                {it.pingId && <PingButton taskId={it.pingId} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
