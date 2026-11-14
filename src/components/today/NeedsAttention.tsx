"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Hourglass } from "lucide-react";
import { useLiveVersion } from "@/components/realtime/RealtimeProvider";

interface AttentionTask {
  id: string;
  code?: string;
  title: string;
  status: string;
}

/**
 * Compact "Needs attention" list: the caller's active blockers plus items in
 * review / waiting on a lead. Renders nothing at all when both are empty.
 */
export function NeedsAttention({
  tasks,
  currentUserId,
  reloadKey = 0,
}: {
  tasks: AttentionTask[];
  currentUserId?: string;
  reloadKey?: number;
}) {
  const live = useLiveVersion();
  const [blockers, setBlockers] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/blockers")
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res?.ok) setBlockers(res.data || []);
      })
      .catch((err) => console.error("Failed to load blockers", err));
    return () => {
      cancelled = true;
    };
  }, [live, reloadKey]);

  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const active = blockers.filter((b) => b.status === "ACTIVE" && (!currentUserId || b.createdById === currentUserId));
  const review = tasks.filter((t) => t.status === "IN_REVIEW" || t.status === "PENDING_APPROVAL");

  if (active.length === 0 && review.length === 0) return null;

  return (
    <section aria-label="Needs attention" className="rounded-[10px] border border-edge bg-surface px-4 py-3">
      <h2 className="text-[12px] font-medium text-muted">Needs attention</h2>
      <ul className="mt-1 divide-y divide-line">
        {active.map((b) => (
          <li key={b.id}>
            <Link href={`/tasks/${b.taskId}`} className="flex min-h-[40px] items-center gap-2.5 text-[13px] hover:text-tealhi">
              <AlertTriangle className="h-4 w-4 shrink-0 text-crimson" aria-hidden />
              <span className="shrink-0 text-[12px] text-crimson">Blocked</span>
              <span className="min-w-0 flex-1 truncate text-ink">{titleById.get(b.taskId) ?? b.reason}</span>
              {titleById.has(b.taskId) && (
                <span className="hidden max-w-[40%] shrink truncate text-[12px] text-muted sm:inline">{b.reason}</span>
              )}
            </Link>
          </li>
        ))}
        {review.map((t) => (
          <li key={t.id}>
            <Link href={`/tasks/${t.code ?? t.id}`} className="flex min-h-[40px] items-center gap-2.5 text-[13px] hover:text-tealhi">
              <Hourglass className="h-4 w-4 shrink-0 text-violet" aria-hidden />
              <span className="shrink-0 text-[12px] text-violet">Awaiting lead</span>
              <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
