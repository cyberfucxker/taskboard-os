import Link from "next/link";
import { prisma } from "@/lib/db";
import { istDayStart } from "./ist";
import { RoutineButton } from "./RoutineButton";

/**
 * My routines in one place: every WorkflowStream this person owns, with today's
 * state (not started / started / done) and one button to start or resume it.
 * Routine instances are ordinary tasks titled "Routine: <stream> — <date>".
 */
export async function MyRoutines({ userId }: { userId: string }) {
  const dayStart = istDayStart();
  const [streams, todays] = await Promise.all([
    prisma.workflowStream.findMany({
      where: { employeeId: userId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true },
    }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        title: { startsWith: "Routine: " },
        createdAt: { gte: dayStart },
        OR: [{ assigneeId: userId }, { creatorId: userId }],
      },
      select: { id: true, title: true, status: true },
    }),
  ]);

  const rows = streams.map((s) => {
    const t = todays.find((x) => x.title.startsWith(`Routine: ${s.title} —`));
    return { ...s, taskId: t?.id ?? null, status: t?.status ?? null };
  });
  const done = rows.filter((r) => r.status === "DONE").length;

  return (
    <section aria-label="My routines">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[12px] font-medium text-muted">
          My routines {rows.length > 0 && <span className="ml-1 text-ink2">{done} / {rows.length} done today</span>}
        </h2>
      </header>
      {rows.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-muted">
          No routines set up yet. Add them from the classic Today page.
        </p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-[40px] items-center gap-2.5 border-b border-line py-1.5 text-[13px] last:border-b-0">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 flex-none rounded-full ${r.status === "DONE" ? "bg-emerald" : r.status ? "bg-amber" : "border border-[var(--faint)]"}`}
              />
              {r.taskId ? (
                <Link href={`/tasks/${r.taskId}`} className="min-w-0 flex-1 truncate text-ink hover:text-tealhi">{r.title}</Link>
              ) : (
                <span className="min-w-0 flex-1 truncate text-ink">{r.title}</span>
              )}
              <span className="flex-none text-[12px] text-muted">
                {r.status === "DONE" ? "Done" : r.status ? "Started" : "Not started"}
              </span>
              {r.status !== "DONE" && (
                <RoutineButton streamTitle={r.title} category={r.category} taskId={r.taskId} userId={userId} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
