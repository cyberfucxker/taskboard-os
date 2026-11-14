import Link from "next/link";
import { Suspense } from "react";
import type { TodayStatus } from "@/lib/time";
import { getDeptBySlug } from "@/lib/dept-metrics";
import { registerWidgets } from "@/components/dept/registry";
import { WidgetBoundary } from "@/components/dept/WidgetBoundary";
import { StatsSkeleton, WidgetSkeleton, fmtLongDay, LINK_CLS } from "@/components/dept/ui";
import type { DeptScope } from "@/components/dept/types";
import { NowBand } from "./NowBand";
import { NeedsYou } from "./NeedsYou";
import { MyWork } from "./MyWork";
import { MyRoutines } from "./MyRoutines";
import { NeedsFixing } from "./NeedsFixing";
import { StandupButton } from "./StandupButton";

/** Renders the card only when NeedsFixing has rows (it returns null otherwise). */
async function FixingCard({ departmentId }: { departmentId: string | null }) {
  const body = await NeedsFixing({ departmentId });
  if (!body) return null;
  return <div className={`${CARD} lg:col-span-2`}>{body}</div>;
}

/** Same lead set as /dept/[slug]: these see a "My team" pill for their own department. */
const LEAD_ROLES = new Set(["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "HR"]);

const CARD = "min-w-0 rounded-[10px] border border-line p-4";
const PILL = "h-7 rounded-full px-3 text-[13px] leading-7 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]";

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * TaskBoard 3 Today: one layout for everyone, content by department.
 *   1. Now        - running timer, up next, hours logged
 *   2. Numbers    - the department's stat tiles (its "-stats" widget)
 *   3. Lists      - Needs you, then the department's widgets
 * Spec: design/dashboards.html
 */
export async function TodayV3({
  userId, name, role, deptSlug, init, requestedScope,
}: {
  userId: string;
  name: string;
  role: string;
  deptSlug: string | null;
  init: TodayStatus;
  requestedScope?: string;
}) {
  const now = new Date();
  const dept = deptSlug ? await getDeptBySlug(deptSlug) : null;
  const isLeadership = deptSlug === "leadership";
  const canTeam = !!dept && !isLeadership && LEAD_ROLES.has(role);
  const isHead = isLeadership || role === "SUPER_ADMIN" || role === "DEPARTMENT_HEAD" || role === "TEAM_LEAD";
  // Leadership's widgets are company-wide by nature; everyone else starts on their own work.
  const scope: DeptScope = isLeadership ? "all" : canTeam && requestedScope === "all" ? "all" : "mine";

  const widgets = dept ? registerWidgets(dept.slug) : [];
  const stats = widgets.filter((w) => w.id.endsWith("-stats"));
  const lists = widgets.filter((w) => !w.id.endsWith("-stats"));
  const first = name.split(" ")[0] || "there";

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">
            {greeting(now)}, {first}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {fmtLongDay(now)}
            {dept ? ` · ${dept.name}` : ""}
            {scope === "all" && !isLeadership ? " · whole team" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StandupButton userId={userId} />
          {canTeam && (
            <nav aria-label="Scope" className="inline-flex gap-1 rounded-full bg-raised p-[3px]">
              {([["mine", "Mine"], ["all", "My team"]] as const).map(([key, label]) => (
                <Link
                  key={key}
                  href={`/today?scope=${key}`}
                  replace
                  aria-current={scope === key ? "page" : undefined}
                  className={`${PILL} ${scope === key ? "bg-[var(--surface)] text-ink shadow-[0_0_0_1px_var(--border-default)]" : "text-muted hover:text-ink"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
          <a href="/api/ui-pref?v=classic" className={`text-[12px] text-muted ${LINK_CLS}`}>
            Back to classic
          </a>
        </div>
      </header>

      <NowBand init={init} />

      {stats.map((w) => (
        <div key={w.id} className={CARD}>
          <WidgetBoundary title={w.title}>
            <Suspense fallback={<StatsSkeleton />}>
              <w.Component departmentId={dept!.id} scope={scope} userId={userId} />
            </Suspense>
          </WidgetBoundary>
        </div>
      ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD} lg:col-span-2`}>
          <Suspense fallback={<WidgetSkeleton title="Needs you" rows={3} />}>
            <NeedsYou userId={userId} />
          </Suspense>
        </div>
        <div className={CARD}>
          <Suspense fallback={<WidgetSkeleton title="My work" />}>
            <MyWork userId={userId} />
          </Suspense>
        </div>
        <div className={CARD}>
          <Suspense fallback={<WidgetSkeleton title="My routines" rows={3} />}>
            <MyRoutines userId={userId} />
          </Suspense>
        </div>
        {isHead && (
          <Suspense fallback={null}>
            <FixingCard departmentId={isLeadership || role === "SUPER_ADMIN" ? null : dept?.id ?? null} />
          </Suspense>
        )}
        {lists.map((w) => (
          <div key={w.id} className={`${CARD} ${w.span === 2 ? "lg:col-span-2" : ""}`}>
            <WidgetBoundary title={w.title}>
              <Suspense fallback={<WidgetSkeleton title={w.title} />}>
                <w.Component departmentId={dept!.id} scope={scope} userId={userId} />
              </Suspense>
            </WidgetBoundary>
          </div>
        ))}
      </div>

      {dept ? (
        <p className="text-[12px] text-muted">
          <Link href={`/dept/${dept.slug}`} className={LINK_CLS}>
            Open the full {dept.name} dashboard →
          </Link>
        </p>
      ) : (
        <p className="text-[12px] text-muted">
          You are not in a department yet, so only your own work shows here. Ask HR to set your department.
        </p>
      )}
    </div>
  );
}
