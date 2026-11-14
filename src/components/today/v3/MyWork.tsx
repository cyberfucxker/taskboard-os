import Link from "next/link";
import { prisma } from "@/lib/db";
import { STATUS_VAR, fmtDay } from "@/components/dept/ui";
import { istDayStart, urgency } from "./ist";

const STATUS_LABEL: Record<string, string> = {
  TODO: "Todo", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done",
};
const MAX_GROUPS = 6;
const MAX_ROWS = 5;

/**
 * My open work, grouped by client (else project, else "Internal"), most urgent first.
 * Groups are ordered by their most urgent task; tasks inside by urgency().
 * Routine instances are left to "My routines".
 */
export async function MyWork({ userId }: { userId: string }) {
  const dayStart = istDayStart();
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "DONE" },
      NOT: { title: { startsWith: "Routine: " } },
      OR: [{ assigneeId: userId }, { assignees: { some: { employeeId: userId } } }],
    },
    take: 200,
    select: {
      id: true, code: true, title: true, status: true, priority: true, dueDate: true,
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });

  type Row = (typeof tasks)[number] & { rank: number };
  const groups = new Map<string, { label: string; href: string | null; rank: number; rows: Row[] }>();
  for (const t of tasks) {
    const key = t.client ? `c${t.client.id}` : t.project ? `p${t.project.id}` : "internal";
    const label = t.client?.name ?? t.project?.name ?? "Internal / no client";
    const href = t.client ? `/clients/${t.client.id}` : t.project ? `/projects/${t.project.id}` : null;
    const rank = urgency(t.dueDate, t.priority, dayStart);
    const g = groups.get(key) ?? { label, href, rank, rows: [] };
    g.rank = Math.min(g.rank, rank);
    g.rows.push({ ...t, rank });
    groups.set(key, g);
  }
  const ordered = Array.from(groups.values())
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.rank - b.rank) }))
    .sort((a, b) => a.rank - b.rank || b.rows.length - a.rows.length);

  return (
    <section aria-label="My work">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[12px] font-medium text-muted">
          My work <span className="ml-1 text-ink2">{tasks.length}</span>
          <span className="ml-2 text-faint">by client, most urgent first</span>
        </h2>
        <Link href="/my-work" className="text-[12px] text-ink2 hover:text-tealhi">All my work →</Link>
      </header>
      {tasks.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-muted">No open tasks assigned to you.</p>
      ) : (
        ordered.slice(0, MAX_GROUPS).map((g) => (
          <div key={g.label}>
            <p className="mt-2 flex items-center gap-2 bg-[var(--bg)] px-1 py-1 text-[12px] text-muted">
              {g.href ? <Link href={g.href} className="font-medium text-ink2 hover:text-tealhi">{g.label}</Link> : <span className="font-medium text-ink2">{g.label}</span>}
              <span>{g.rows.length}</span>
            </p>
            <ul>
              {g.rows.slice(0, MAX_ROWS).map((t) => {
                const overdue = t.rank < 10;
                const today = t.rank >= 10 && t.rank < 20;
                return (
                  <li key={t.id} className="border-b border-line last:border-b-0">
                    <Link href={`/tasks/${t.id}`} className="flex min-h-[40px] items-center gap-2.5 py-1.5 text-[13px] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]">
                      <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: STATUS_VAR[t.status] ?? "var(--muted)" }} />
                      <span className="sr-only">{STATUS_LABEL[t.status] ?? t.status}</span>
                      <span className="w-9 flex-none font-mono text-[12px] text-muted">{t.code}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
                      {t.priority === "P0" && <span className="flex-none rounded-full bg-crimson/10 px-2 text-[11px] text-crimson">Urgent</span>}
                      <span className={`w-20 flex-none text-right text-[12px] ${overdue ? "text-crimson" : today ? "text-amber" : "text-muted"}`}>
                        {t.dueDate ? (overdue ? `${fmtDay(t.dueDate)} · late` : today ? "Today" : fmtDay(t.dueDate)) : "No date"}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {g.rows.length > MAX_ROWS && (
                <li className="py-1 text-[12px] text-muted">+{g.rows.length - MAX_ROWS} more in My work</li>
              )}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
