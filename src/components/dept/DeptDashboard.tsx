import Link from "next/link";
import { Suspense } from "react";
import type { DeptInfo } from "@/lib/dept-metrics";
import { registerWidgets } from "./registry";
import { AcrossDepartments, asComponent } from "./widgets/shared";
import type { DeptScope } from "./types";
import { StatsSkeleton, WidgetSkeleton, fmtLongDay, LINK_CLS } from "./ui";
import { WidgetBoundary } from "./WidgetBoundary";

export interface DeptNavItem { slug: string; name: string }

/**
 * Department dashboard template: thin header, scope pill, then the registered
 * widgets in a 2-column grid (1 column on phones). Content differs per department,
 * the frame does not.
 */
export function DeptDashboard({
  dept, scope, userId, showToggle, deptNav, today, showAcross = true,
}: {
  dept: DeptInfo;
  scope: DeptScope;
  userId: string;
  showToggle: boolean;
  deptNav: DeptNavItem[];
  today: Date;
  /** Off for non-leads in whole-department view: it would list other departments' tasks of colleagues. */
  showAcross?: boolean;
}) {
  // "Across departments" is appended for every department so no widget set can forget it.
  const widgets = [
    ...registerWidgets(dept.slug),
    ...(showAcross ? [{ id: "across-departments", title: "Across departments", span: 2 as const, Component: asComponent(AcrossDepartments) }] : []),
  ];
  const base = `/dept/${dept.slug}`;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: dept.color }} />
            {dept.name}
          </h1>
          <p className="mt-0.5 text-[12px] text-muted">
            {scope === "mine" ? "Your work" : "Whole department"} · {fmtLongDay(today)}
          </p>
        </div>
        {showToggle && (
          <nav aria-label="Dashboard scope" className="inline-flex gap-1 text-[12px]">
            {([["mine", "Mine"], ["all", "Whole department"]] as const).map(([key, label]) => (
              <Link
                key={key}
                href={`${base}?scope=${key}`}
                replace
                aria-current={scope === key ? "page" : undefined}
                className={`h-7 rounded-full px-3 text-[13px] leading-7 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)] ${
                  scope === key ? "bg-hover text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {deptNav.length > 1 && (
        <nav aria-label="Departments" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {deptNav.map((d) => (
            <Link
              key={d.slug}
              href={`/dept/${d.slug}`}
              aria-current={d.slug === dept.slug ? "page" : undefined}
              className={`${LINK_CLS} ${d.slug === dept.slug ? "text-ink" : "text-muted"}`}
            >
              {d.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {widgets.map((w) => (
          <div key={w.id} className={w.span === 2 ? "min-w-0 lg:col-span-2" : "min-w-0"}>
            <WidgetBoundary title={w.title}>
              <Suspense fallback={w.id.endsWith("stats") ? <StatsSkeleton /> : <WidgetSkeleton title={w.title} />}>
                <w.Component departmentId={dept.id} scope={scope} userId={userId} />
              </Suspense>
            </WidgetBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Permission-denied state, shown in place (never a redirect loop). */
export function DeptDenied({ homeHref }: { homeHref: string }) {
  return (
    <div className="mx-auto max-w-[480px] px-4 py-16 text-center">
      <h1 className="text-[15px] font-semibold text-ink">This dashboard is not available to you</h1>
      <p className="mt-2 text-[13px] text-muted">
        You can open your own department&apos;s dashboard. Only admins and Leadership can open other departments.
      </p>
      <Link href={homeHref} className={`mt-4 inline-block text-[13px] text-tealhi ${LINK_CLS}`}>Go to your dashboard</Link>
    </div>
  );
}
