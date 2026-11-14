"use client";

import { useEffect, useState } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { Avatar, Badge, Bar, EmptyState } from "@/components/ui";
import { EntityLink } from "@/components/entity/EntityLink";
import type { CourseBlockContent, CourseContent } from "@/lib/lmsContent";

interface TeamRow {
  enrollmentId: string;
  employee: { id: string; name: string; department: string | null };
  course: { id: string; slug: string; title: string };
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  blocksDone: number;
  blocksTotal: number;
  startedAt: string | null;
  completedAt: string | null;
  lastActivity: string;
}

interface EnrollmentDetail {
  id: string;
  employee: { id: string; name: string };
  course: { id: string; slug: string; title: string; content: CourseContent };
  blocks: Array<{
    blockId: string;
    completed: boolean;
    fields: Record<string, string> | null;
    drillAnswers: Record<string, { answer: string; revealed: boolean }> | null;
  }>;
}

const BADGE: Record<TeamRow["status"], string> = { NOT_STARTED: "todo", IN_PROGRESS: "inprogress", COMPLETED: "done" };

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Leadership-only roster: every employee × course, block-completion counts,
 *  and a per-row drill-down into the actual answers a rep wrote. Fetched
 *  client-side from /api/lms/team — the API route is the real RBAC gate
 *  (lms.manage), this component just renders whatever it's handed. */
export function TeamProgress() {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnrollmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const live = useLiveVersion();
  useEffect(() => {
    fetch("/api/lms/team")
      .then((r) => r.json())
      .then((d) => (d.ok ? setRows(d.rows) : setError(d.error ?? "Failed to load")))
      .catch(() => setError("Failed to load"));
  }, [live]);

  async function toggleRow(row: TeamRow) {
    if (openId === row.enrollmentId) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(row.enrollmentId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/lms/team/${row.enrollmentId}`);
      const data = await res.json();
      if (data.ok) setDetail(data.enrollment);
    } finally {
      setDetailLoading(false);
    }
  }

  if (error) return <EmptyState title="Couldn't load team progress" hint={error} />;
  if (!rows) return <div className="text-sm text-muted">Loading…</div>;
  if (rows.length === 0) return <EmptyState title="No one has started a module yet" />;

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const pct = row.blocksTotal ? (row.blocksDone / row.blocksTotal) * 100 : 0;
        const open = openId === row.enrollmentId;
        return (
          <div key={row.enrollmentId} className="rounded-[10px] border border-edge bg-raised">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleRow(row)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(row); } }}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
            >
              <Avatar name={row.employee.name} size={28} />
              <div className="min-w-0 flex-1">
                <span onClick={(e) => e.stopPropagation()} className="block">
                  <EntityLink
                    entity={{ type: "person", id: row.employee.id, name: row.employee.name }}
                    className="truncate text-[13.5px] font-medium"
                  />
                </span>
                <div className="truncate text-[11px] text-muted">
                  {row.employee.department ?? "—"} · {row.course.title}
                </div>
              </div>
              <div className="w-32 shrink-0">
                <Bar pct={pct} color={row.status === "COMPLETED" ? "var(--emerald)" : "var(--teal)"} />
                <div className="mt-1 text-right text-[11px] text-muted">
                  {row.blocksDone}/{row.blocksTotal}
                </div>
              </div>
              <Badge text={BADGE[row.status]} />
              <div className="w-16 shrink-0 text-right text-[11px] text-muted">{timeAgo(row.lastActivity)}</div>
            </div>

            {open && (
              <div className="border-t border-edge px-4 py-3">
                {detailLoading && <div className="text-[13px] text-muted">Loading…</div>}
                {detail && detail.id === row.enrollmentId ? (
                  <BlockAnswers blocks={detail.course.content.blocks} progress={detail.blocks} />
                ) : detailLoading ? null : (
                  <div className="text-[13px] text-muted">Failed to load detail.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlockAnswers({
  blocks,
  progress,
}: {
  blocks: CourseBlockContent[];
  progress: EnrollmentDetail["blocks"];
}) {
  const byId = new Map(progress.map((p) => [p.blockId, p]));
  const withWork = blocks.filter((b) => {
    const p = byId.get(b.id);
    return p && ((p.fields && Object.values(p.fields).some((v) => v?.trim())) || (p.drillAnswers && Object.values(p.drillAnswers).some((d) => d?.answer?.trim())));
  });

  if (withWork.length === 0) return <div className="text-[13px] text-muted">No written work yet.</div>;

  return (
    <div className="space-y-4">
      {withWork.map((b) => {
        const p = byId.get(b.id)!;
        return (
          <div key={b.id}>
            <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              {b.title}
              {p.completed && <Badge text="done" />}
            </div>
            <div className="space-y-2">
              {(b.fields ?? []).map((f) => {
                const v = p.fields?.[f.id];
                if (!v?.trim()) return null;
                return (
                  <div key={f.id}>
                    <div className="text-[11px] text-muted">{f.label}</div>
 <div className="whitespace-pre-wrap rounded-md border border-edge bg-bg h-8 px-3 text-[13px] text-ink">
                      {v}
                    </div>
                  </div>
                );
              })}
              {(b.drills ?? []).map((d, i) => {
                const a = p.drillAnswers?.[String(i)]?.answer;
                if (!a?.trim()) return null;
                return (
                  <div key={i}>
                    <div className="text-[11px] text-muted">{d.q}</div>
 <div className="whitespace-pre-wrap rounded-md border border-edge bg-bg h-8 px-3 text-[13px] text-ink">
                      {a}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
