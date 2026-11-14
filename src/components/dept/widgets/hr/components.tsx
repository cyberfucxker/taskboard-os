import { cache } from "react";
import Link from "next/link";
import type { StatTileData } from "@/lib/dept-metrics";
import { attendanceToday, hiringPipeline, lmsCompletion, onboarding } from "@/lib/dept-metrics-hr";
import type { DeptWidgetProps } from "../../types";
import { EmptyBlock, LINK_CLS, StatTile } from "../../ui";
import { Bar, PersonLink, Pill, ResultView, ROW_CLS, plural } from "../lane-d-kit";

const getAttendance = cache(attendanceToday);
const getHiring = cache(hiringPipeline);
const getOnboarding = cache(onboarding);
const getLms = cache(lmsCompletion);

/* ------------------------------------------------------------- stat tiles */

export async function HrStats({ departmentId, scope, userId }: DeptWidgetProps) {
  const [att, hire, lms] = await Promise.all([
    getAttendance(userId, scope, departmentId), getHiring(userId, departmentId), getLms(userId, scope, departmentId),
  ]);
  if (att.state !== "ok") {
    return (
      <div>
        <EmptyBlock
          title={att.state === "denied" ? "People numbers are not available for your role" : "Could not load the HR summary"}
          hint={att.state === "denied" ? att.reason : "Refresh to try again."}
        />
      </div>
    );
  }
  const tiles: StatTileData[] = [
    {
      label: "Active today", value: att.data.weekOff ? "Week off" : `${att.data.present} of ${att.data.total}`,
      href: "/hrms", hint: att.data.weekOff ? "Sunday" : att.data.noActivity > 0 ? `${att.data.noActivity} not started yet` : "everyone has started",
    },
    {
      label: "On leave", value: String(att.data.onLeave), href: "/hrms",
      tone: att.data.absent > 0 ? "warn" : "default", hint: att.data.absent > 0 ? `${att.data.absent} absent` : "today",
    },
    {
      label: "Candidates", value: hire.state === "ok" ? String(hire.data.total) : "-",
      href: hire.state === "ok" && hire.data.canOpenCrm ? "/crm/leads" : "/hrms",
      hint: hire.state === "ok" && hire.data.exists ? "in the hiring pipeline" : "no hiring pipeline yet",
    },
    {
      label: "Training done", value: lms.state === "ok" && lms.data.enrolled > 0 ? `${lms.data.pct}%` : "-",
      href: "/lms", tone: "default",
      hint: lms.state === "ok" ? `${lms.data.completed} of ${lms.data.enrolled} enrolments` : "",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => <StatTile key={t.label} tile={t} />)}
    </div>
  );
}

/* ------------------------------------------------------ attendance / leave */

export async function AttendanceLeave({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getAttendance(userId, scope, departmentId);
  return (
    <ResultView title="Attendance and leave today" result={r} href="/hrms" hrefLabel="Open HRMS">
      {(d) => {
        if (d.total === 0) return <EmptyBlock title="No people in this view" />;
        const cells: { label: string; n: number; tone: "emerald" | "amber" | "crimson" | "muted" }[] = [
          { label: "Active", n: d.present, tone: "emerald" },
          { label: "On leave", n: d.onLeave, tone: "amber" },
          { label: "Half day", n: d.halfDay, tone: "amber" },
          { label: "Absent", n: d.absent, tone: "crimson" },
          { label: "Not started", n: d.noActivity, tone: "muted" },
        ];
        return (
          <>
            <p className="mt-1 text-[12px] text-muted">
              {d.dateLabel} · {plural(d.total, "person", "people")}
              {d.weekOff ? " · weekly off, so nobody is flagged for not starting" : ""}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {cells.map((c) => (
                <li key={c.label} className="border-b border-line px-1 py-2">
                  <p className="text-[11px] text-muted">{c.label}</p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-ink">{c.n}</p>
                </li>
              ))}
            </ul>
            {d.onLeaveList.length === 0 && d.absentList.length === 0 ? (
              <p className="pt-3 text-[12px] text-muted">Nobody is on leave or marked absent today.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {d.onLeaveList.map((p) => (
                  <li key={`l-${p.id}`} className={ROW_CLS}>
                    <PersonLink id={p.id} name={p.name} />
                    <Pill text="On leave" tone="amber" />
                  </li>
                ))}
                {d.absentList.map((p) => (
                  <li key={`a-${p.id}`} className={ROW_CLS}>
                    <PersonLink id={p.id} name={p.name} />
                    <Pill text="Absent" tone="crimson" />
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }}
    </ResultView>
  );
}

/* ------------------------------------------------------ hiring pipeline */

export async function HiringPipeline({ departmentId, userId }: DeptWidgetProps) {
  const r = await getHiring(userId, departmentId);
  const href = r.state === "ok" && r.data.canOpenCrm ? "/crm/leads" : undefined;
  return (
    <ResultView title="Hiring pipeline" result={r} href={href} hrefLabel="Open leads">
      {(d) => {
        if (!d.exists) return <EmptyBlock title="No hiring pipeline yet" hint="It is created automatically when the first job-application form receives an applicant." />;
        if (d.total === 0) return <EmptyBlock title="No applicants yet" hint="Candidates appear here by stage once they apply." />;
        const max = Math.max(1, ...d.stages.map((s) => s.count));
        return (
          <ul className="divide-y divide-line">
            {d.stages.map((s) => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  {href ? <Link href={href} className={`truncate text-ink ${LINK_CLS}`}>{s.name}</Link> : <span className="truncate text-ink">{s.name}</span>}
                  <span className="shrink-0 tabular-nums text-ink2">{s.count}</span>
                </div>
                <div className="mt-1.5">
                  <Bar pct={(s.count / max) * 100} tone={s.isWon ? "emerald" : s.isLost ? "muted" : "teal"} label={`${s.name}: ${s.count} candidates`} />
                </div>
              </li>
            ))}
          </ul>
        );
      }}
    </ResultView>
  );
}

/* ------------------------------------------------------ onboarding */

export async function OnboardingTasks({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getOnboarding(userId, scope, departmentId);
  return (
    <ResultView title="Onboarding" result={r} href="/team" hrefLabel="Open team">
      {(d) =>
        d.joiners.length === 0 && d.tasks.length === 0 ? (
          <EmptyBlock
            title="No new joiners or onboarding tasks"
            hint="People who joined in the last 30 days, and open tasks with 'onboarding' in the title, appear here."
          />
        ) : (
          <>
            {d.joiners.length > 0 && (
              <>
                <p className="mt-1 text-[12px] text-muted">Joined in the last 30 days</p>
                <ul className="divide-y divide-line">
                  {d.joiners.map((j) => (
                    <li key={j.id} className={ROW_CLS}>
                      <span className="text-[13px]">
                        <PersonLink id={j.id} name={j.name} />
                        <span className="ml-2 text-[12px] text-muted">joined {j.joinedLabel}</span>
                      </span>
                      <span className="text-[12px] tabular-nums text-muted">
                        {plural(j.openTasks, "open task")} · {j.coursesTotal ? `${j.coursesDone}/${j.coursesTotal} courses` : "no courses yet"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {d.tasks.length > 0 && (
              <>
                <p className="mt-3 text-[12px] text-muted">Open onboarding tasks ({d.totalTasks})</p>
                <ul className="divide-y divide-line">
                  {d.tasks.map((t) => (
                    <li key={t.id} className={ROW_CLS}>
                      <span className="min-w-0 flex-1 text-[13px]">
                        <Link href={`/tasks?task=${t.code}`} className={`text-ink ${LINK_CLS}`}>
                          <span className="mr-2 font-mono text-[11px] text-muted">{t.code}</span>
                          {t.title}
                        </Link>
                      </span>
                      <span className="flex items-baseline gap-x-3 text-[12px] text-muted">
                        <PersonLink id={t.assigneeId} name={t.assigneeName} />
                        {t.dueLabel && (t.overdue ? <Pill text={`Overdue ${t.dueLabel}`} tone="crimson" /> : <span className="tabular-nums">{t.dueLabel}</span>)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )
      }
    </ResultView>
  );
}

/* ------------------------------------------------------ LMS completion */

export async function LmsCompletion({ departmentId, scope, userId }: DeptWidgetProps) {
  const r = await getLms(userId, scope, departmentId);
  return (
    <ResultView title="Training completion" result={r} href="/lms" hrefLabel="Open training">
      {(d) =>
        d.courses.length === 0 ? (
          <EmptyBlock title="No published courses" hint="Completion per course shows here once training is published." />
        ) : (
          <>
            <p className="mt-1 text-[12px] text-muted">
              {d.completed} of {d.enrolled} enrolments complete across {plural(d.courses.length, "course")}, {plural(d.staff, "person", "people")} on staff
            </p>
            <ul className="mt-1 divide-y divide-line">
              {d.courses.map((c) => (
                <li key={c.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <Link href={`/lms/${c.id}`} className={`truncate text-ink ${LINK_CLS}`}>{c.title}</Link>
                    <span className="shrink-0 tabular-nums text-ink2">
                      {c.enrolled === 0 ? "nobody enrolled" : `${c.completed}/${c.enrolled} · ${c.pct}%`}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar pct={c.pct} tone="emerald" label={`${c.title}: ${c.pct} percent complete`} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </ResultView>
  );
}
