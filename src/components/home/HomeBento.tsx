import { PlanMyDay } from "./PlanMyDay";
import { WrapUp } from "./WrapUp";
import { RoutineChecklist } from "./RoutineChecklist";
import { InboxTile } from "./InboxTile";
import { RunningTimerTile } from "./RunningTimerTile";

export interface PlanTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  estimateHrs: number | null;
  dueDate: string | null;
  clientName: string | null;
  projectName: string | null;
}

export interface PlanSlot {
  slot: number;
  task: PlanTask | null;
}

export interface RoutineItem {
  id: string;
  title: string;
  description: string | null;
  scheduledTime: string;
  frequency: string;
  priority?: string;
  scheduledDays?: string[];
}

export interface WrapData {
  did: string;
  doing: string;
  blockedOn: string;
  submitted: boolean;
  doneCount: number;
  sessionHrs: number;
}

export interface HomeData {
  dateStr: string;
  greeting: string;
  employeeName: string;
  inboxCount: number;
  overdueCount: number;
  routinesDue: number;
  unreadCount: number;
  plan: PlanSlot[];
  planTotalHrs: number;
  overload: boolean;
  running: { taskId: string; code: string; title: string; startedAtMs: number } | null;
  loggedMs: number;
  goalMs: number;
  wrap: WrapData;
  routines: RoutineItem[];
  candidates: PlanTask[];
}

/**
 * Home bento — plain-div tiles on token surfaces for now. When R7's
 * motion/BentoGrid primitives land, each tile component below is already
 * small enough that the swap is a 1-line wrapper change.
 */
export function HomeBento({ data }: { data: HomeData }) {
  const day = new Date(`${data.dateStr}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {data.greeting}, {data.employeeName}
          </h1>
          <p className="label">{day} · IST</p>
        </div>
        {data.unreadCount > 0 && (
          <a
            href="/my-work"
            className="rounded-full border border-edge bg-surface px-3 py-1 text-[12px] text-muted hover:text-ink"
          >
            {data.unreadCount} unread notification{data.unreadCount === 1 ? "" : "s"}
          </a>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <InboxTile
          inboxCount={data.inboxCount}
          overdueCount={data.overdueCount}
          routinesDue={data.routinesDue}
        />
        <RunningTimerTile running={data.running} loggedMs={data.loggedMs} goalMs={data.goalMs} />
        <div className="rounded-lg border border-edge bg-surface p-4">
          <div className="label mb-1">Today&apos;s plan</div>
          <div className="text-2xl font-semibold text-ink">
            {data.plan.filter((p) => p.task).length}
            <span className="text-sm font-normal text-muted"> / 3 pinned</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {data.planTotalHrs > 0
              ? `~${data.planTotalHrs}h estimated`
              : "Nothing pinned yet — plan below."}
          </p>
          {data.overload && (
            <p className="mt-2 rounded-md border border-edge bg-raised px-2 py-1 text-[12px] font-medium text-crimson">
              Overload — planned {data.planTotalHrs}h is over the 7h day.
            </p>
          )}
        </div>
      </div>

      <PlanMyDay
        dateStr={data.dateStr}
        initialPlan={data.plan}
        initialTotal={data.planTotalHrs}
        candidates={data.candidates}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <RoutineChecklist routines={data.routines} />
        <WrapUp dateStr={data.dateStr} initial={data.wrap} />
      </div>
    </div>
  );
}
