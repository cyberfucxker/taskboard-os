export function InboxTile({
  inboxCount,
  overdueCount,
  routinesDue,
}: {
  inboxCount: number;
  overdueCount: number;
  routinesDue: number;
}) {
  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <div className="label mb-2">Needs attention</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-ink">{inboxCount}</span>
        <span className="text-[12px] text-muted">in inbox</span>
      </div>
      <div className="mt-2 space-y-1 text-[13px]">
        <a href="/tasks" className="block text-muted hover:text-ink">
          {overdueCount} overdue task{overdueCount === 1 ? "" : "s"} →
        </a>
        <a href="/today" className="block text-muted hover:text-ink">
          {routinesDue} routine{routinesDue === 1 ? "" : "s"} due today →
        </a>
      </div>
    </div>
  );
}
