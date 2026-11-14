import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { ScopedSession } from "@/lib/scope";
import { safe } from "@/lib/dept-metrics";
import { WorkloadAccessError, getDepartmentWorkload, fmtMinutes, type DeptWorkloadRow } from "@/lib/workload";
import { CapacityBar, StatusPill } from "@/components/workload/WorkloadMeter";
import { EmptyBlock, ErrorBlock, LINK_CLS, WidgetShell } from "../../ui";
import type { DeptWidgetProps } from "../../types";

/**
 * Department dashboard widget: who is overloaded, who has no plan, who is idle.
 * Read-only. Authorization is re-checked here against the SIGNED-IN user (never the props'
 * userId): a head sees only their own department's people, a member only their own row,
 * SUPER_ADMIN / Leadership any department. Counts only - no task titles of anyone's work.
 */
export async function WorkloadWidget({ departmentId, scope }: DeptWidgetProps) {
  const session = (await getServerSession(authOptions)) as ScopedSession | null;
  const me = session?.user;
  if (!me?.id) return <WidgetShell title="Workload"><ErrorBlock hint="Sign in again to see this." /></WidgetShell>;

  const r = await safe<DeptWorkloadRow[] | "denied">(async () => {
    try {
      return await getDepartmentWorkload(
        departmentId,
        { id: me.id, role: me.role, departmentId: me.departmentId ?? null, departmentSlug: me.departmentSlug ?? null },
        scope,
      );
    } catch (e) {
      if (e instanceof WorkloadAccessError && e.status === 403) return "denied";
      throw e;
    }
  });
  if (r.error || !r.data) return <WidgetShell title="Workload"><ErrorBlock /></WidgetShell>;
  if (r.data === "denied") return <WidgetShell title="Workload"><EmptyBlock title="Not available" hint="Workload is visible to your own department only." /></WidgetShell>;
  const rows = r.data;
  if (rows.length === 0) return <WidgetShell title="Workload"><EmptyBlock title="No people to show" /></WidgetShell>;

  return (
    <WidgetShell title={scope === "mine" ? "My workload" : "Workload"}>
      <ul className="mt-1 divide-y divide-line">
        {rows.map((p) => (
          <li key={p.employeeId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto]">
            <div className="min-w-0">
              <Link href={`/team/${p.employeeId}`} className={`block truncate text-[13px] text-ink ${LINK_CLS}`}>{p.name}</Link>
              <p className="text-[11px] text-muted">
                {p.inProgressCount} in progress
                {p.overdueCount > 0 && <span className={p.overdueCount >= 3 ? "font-medium text-crimson" : ""}> · {p.overdueCount} overdue</span>}
              </p>
            </div>
            <div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
              <CapacityBar plannedMinutes={p.plannedMinutes} capacityMinutes={p.capacityMinutes} label={`${p.name}: planned against capacity`} />
              <p className="mt-1 text-[11px] text-muted">
                {fmtMinutes(p.plannedMinutes)} of {fmtMinutes(p.capacityMinutes)}
                {p.overcommitMinutes > 0 && <span className="font-medium text-crimson"> · over by {fmtMinutes(p.overcommitMinutes)}</span>}
              </p>
            </div>
            <div className="justify-self-end"><StatusPill status={p.status} /></div>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}
