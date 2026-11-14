"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Rocket, Flame, Trophy, Lock, Building2 } from "lucide-react";
import { Card, Bar, Badge, EmptyState } from "@/components/ui";
import { TeamProgress } from "@/components/lms/TeamProgress";
import { useToast } from "@/components/Toast";
import { ListToolbar, NoMatches, StickyList, useListFilter } from "@/components/list";

interface CourseCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  department: string;
  openable: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  blocksDone: number;
  blocksTotal: number;
}

const CTA: Record<CourseCard["status"], string> = {
  NOT_STARTED: "Start this module",
  IN_PROGRESS: "Pick up where you left off",
  COMPLETED: "Revisit your work",
};
const BADGE: Record<CourseCard["status"], string> = {
  NOT_STARTED: "todo",
  IN_PROGRESS: "inprogress",
  COMPLETED: "done",
};
const STATUS_ICON: Record<CourseCard["status"], React.ComponentType<{ className?: string }>> = {
  NOT_STARTED: Rocket,
  IN_PROGRESS: Flame,
  COMPLETED: Trophy,
};
const STATUS_ICON_COLOR: Record<CourseCard["status"], string> = {
  NOT_STARTED: "text-muted",
  IN_PROGRESS: "text-amber",
  COMPLETED: "text-emerald",
};

function statusLine(status: CourseCard["status"], done: number, total: number) {
  if (status === "COMPLETED") return "You finished this one";
  if (status === "NOT_STARTED") return `${total} section${total === 1 ? "" : "s"} — open anytime`;
  return `${done} of ${total} sections — keep going`;
}

export function LmsHome({
  courses,
  companyKnowledge,
  canManage,
}: {
  courses: CourseCard[];
  companyKnowledge: CourseCard[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const toast = useToast();
  const [statusPill, setStatusPill] = useState<"all" | CourseCard["status"]>("all");
  const allCards = useMemo(() => [...companyKnowledge, ...courses], [companyKnowledge, courses]);
  const f = useListFilter(allCards, (c) => [c.title, c.description, c.department].filter(Boolean).join(" "));
  const keep = useMemo(() => new Set(f.filtered.map((c) => c.id)), [f.filtered]);
  const shownKnowledge = companyKnowledge.filter((c) => keep.has(c.id));
  const shownCourses = courses.filter((c) => keep.has(c.id) && (statusPill === "all" || c.status === statusPill));
  const pillCount = (st: CourseCard["status"]) => courses.filter((c) => c.status === st).length;

  // Same leadership bypass as everywhere else in Learning (lms.manage —
  // SUPER_ADMIN, HR, or the leadership department): everyone else can't
  // lift the catalog's text out via copy/cut/paste/right-click.
  const restrictCopy = !canManage;
  const copyGuard = restrictCopy
    ? {
        onCopy: (e: React.ClipboardEvent) => {
          e.preventDefault();
          toast("Copying is disabled in Learning", "error");
        },
        onCut: (e: React.ClipboardEvent) => {
          e.preventDefault();
          toast("Copying is disabled in Learning", "error");
        },
        onPaste: (e: React.ClipboardEvent) => {
          e.preventDefault();
          toast("Pasting is disabled in Learning", "error");
        },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};
  const guardCls = restrictCopy ? " select-none [-webkit-touch-callout:none]" : "";

  return (
    <div className={"h-full" + guardCls} {...copyGuard}>
    <StickyList
      header={<div className="flex h-12 items-center border-b border-line px-4"><h1 className="text-[14px] font-semibold tracking-tight text-ink">Learning</h1></div>}
      toolbar={
        <ListToolbar
          filter={f}
          shown={shownKnowledge.length + shownCourses.length}
          total={allCards.length}
          noun="modules"
          placeholder="Filter modules…"
          pills={[
            { id: "all", label: "All", active: statusPill === "all", onClick: () => setStatusPill("all") },
            { id: "IN_PROGRESS", label: "In progress", count: pillCount("IN_PROGRESS"), active: statusPill === "IN_PROGRESS", onClick: () => setStatusPill("IN_PROGRESS") },
            { id: "NOT_STARTED", label: "Not started", count: pillCount("NOT_STARTED"), active: statusPill === "NOT_STARTED", onClick: () => setStatusPill("NOT_STARTED") },
            { id: "COMPLETED", label: "Completed", count: pillCount("COMPLETED"), active: statusPill === "COMPLETED", onClick: () => setStatusPill("COMPLETED") },
          ]}
        />
      }
    >
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-1 text-xl font-semibold text-ink">Learning</div>
      <p className="mb-5 text-sm text-muted">
        Pick a module and work through it at your own pace — every answer autosaves, and there's no clock to beat.
      </p>

      {/* Company Knowledge — a reference hub, always at the top, not a course
          track. Consult it whenever you need something about the company. */}
      {shownKnowledge.length > 0 && (
        <div className="mb-7 rounded-[10px] border border-edge bg-raised p-5">
          <div className="mb-3 flex items-center gap-2 text-ink">
            <Building2 className="h-5 w-5 text-teal" />
            <span className="text-sm font-semibold">Company Knowledge</span>
          </div>
          <p className="mb-4 text-[13px] text-muted">
            The place to look when you need something about our company — who we are, what we build, and the standard we
            work to. Open any reference anytime; there&apos;s nothing to &ldquo;complete&rdquo;.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {shownKnowledge.map((c) => (
              <div key={c.id} className="border-b border-line py-3">
                <div className="mb-1 flex items-center justify-between">
                  <Badge text={c.department} />
                  <span className="text-[11px] text-muted">always open</span>
                </div>
                <div className="mb-1 text-[15px] font-semibold text-ink">{c.title}</div>
                <p className="mb-3 text-[12.5px] text-muted">{c.description}</p>
                <Link
                  href={`/lms/${c.id}`}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-teal hover:text-ink"
                >
                  Open reference →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div className="mb-5 flex gap-1 border-b border-edge">
          {(["mine", "team"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-3 py-2 text-[13px] " +
                (tab === t ? "rounded-full bg-hover text-ink" : "text-muted hover:text-ink")
              }
            >
              {t === "mine" ? "My modules" : "Team progress"}
            </button>
          ))}
        </div>
      )}

      {canManage && tab === "team" ? (
        <TeamProgress />
      ) : courses.length === 0 ? (
        <EmptyState title="No modules yet" hint="Learning content will appear here." />
      ) : shownCourses.length === 0 && shownKnowledge.length === 0 ? (
        <NoMatches onClear={() => { f.clear(); setStatusPill("all"); }} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {shownCourses.map((c) => (
            <div key={c.id} className="flex flex-col border-b border-line py-3">
              <div className="mb-1 flex items-center justify-between">
                <Badge text={c.department} />
                <span className="text-[11px] text-muted">
                  {statusLine(c.status, c.blocksDone, c.blocksTotal)}
                </span>
              </div>
              <div className="mb-1 text-[15px] font-semibold text-ink">{c.title}</div>
              <p className="mb-3 line-clamp-2 text-[12.5px] text-muted">{c.description}</p>
              {c.openable ? (
                <Link
                  href={`/lms/${c.id}`}
                  className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-teal hover:text-ink"
                >
                  <Rocket className="h-3.5 w-3.5" /> {CTA[c.status]}
                </Link>
              ) : (
                <span className="mt-auto inline-flex items-center gap-1 text-[13px] text-muted">
                  <Lock className="h-3.5 w-3.5" /> Locked — {c.department}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </StickyList>
    </div>
  );
}