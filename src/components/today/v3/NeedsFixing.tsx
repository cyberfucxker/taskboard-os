import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Heads only: open tasks in their area that are missing an owner or a due date,
 * so the numbers on every dashboard stay true. `departmentId` null = whole company.
 */
export async function NeedsFixing({ departmentId }: { departmentId: string | null }) {
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    status: { not: "DONE" },
    OR: [{ assigneeId: null }, { dueDate: null }, ...(departmentId ? [] : [{ departmentId: null }])],
    ...(departmentId ? { departmentId } : {}),
  };
  const [count, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 8,
      select: { id: true, code: true, title: true, assigneeId: true, dueDate: true, departmentId: true, creator: { select: { name: true } } },
    }),
  ]);
  if (count === 0) return null;

  return (
    <section aria-label="Needs fixing">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[12px] font-medium text-muted">
          Needs fixing <span className="ml-1 text-ink2">{count}</span>
          <span className="ml-2 text-faint">tasks missing an owner or due date</span>
        </h2>
        <Link href="/tasks" className="text-[12px] text-ink2 hover:text-tealhi">Tasks →</Link>
      </header>
      <ul>
        {rows.map((t) => (
          <li key={t.id} className="border-b border-line last:border-b-0">
            <Link href={`/tasks/${t.id}`} className="flex min-h-[40px] flex-wrap items-center gap-2 py-1.5 text-[13px] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]">
              <span className="w-9 flex-none font-mono text-[12px] text-muted">{t.code}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
              {!t.assigneeId && <span className="rounded-full bg-amber/10 px-2 text-[11px] text-amber">No owner</span>}
              {!t.dueDate && <span className="rounded-full bg-amber/10 px-2 text-[11px] text-amber">No due date</span>}
              {!t.departmentId && <span className="rounded-full bg-amber/10 px-2 text-[11px] text-amber">No department</span>}
              {t.creator?.name && <span className="hidden text-[12px] text-muted sm:inline">by {t.creator.name}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
