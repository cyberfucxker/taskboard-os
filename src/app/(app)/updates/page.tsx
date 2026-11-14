import { guardPage } from "@/lib/pages";
import { istDayStart, istDateKey } from "@/lib/time";
import { prisma } from "@/lib/db";
import { getStandupFeed } from "@/lib/standup";
import { StandupWorkbench, type StandupEntry } from "@/components/standup/StandupWorkbench";

export const dynamic = "force-dynamic";

export default async function StandupPage() {
  const session = await guardPage("Updates");

  const todayStart = istDayStart(new Date());

  // getStandupFeed applies the real RBAC scope: leaders (SUPER_ADMIN /
  // DEPARTMENT_HEAD / TEAM_LEAD) see everyone, everyone else sees only their
  // own department plus themselves. A previous version of this page queried
  // dailyUpdate.findMany with no scoping at all, leaking every employee's
  // private daily standup to every other employee regardless of department.
  const [feed, departments] = await Promise.all([
    getStandupFeed(session, todayStart.toISOString().slice(0, 10)),
    prisma.department.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entries: StandupEntry[] = feed.map((u) => ({
    id: u.id,
    employeeId: u.employeeId,
    employeeName: u.employee || "Team Member",
    employeeAvatar: null,
    employeeRole: u.role || "MEMBER",
    departmentName: u.dept || "General",
    departmentColor: u.deptColor || "var(--accent)",
    date: u.date,
    did: u.did || "",
    doing: u.doing || "",
    blocked: u.blockedOn ?? null,
    createdAt: u.createdAt,
    isSelf: u.isOwn,
  }));

  const userTodayEntry = entries.find((e) => e.isSelf) || null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg-default)]">
            Daily Standup Cockpit
          </h1>
          <p className="text-sm text-[var(--fg-muted)] mt-1">
            Async daily updates, automated progress logging, and blockers detection
          </p>
        </div>
      </div>

      <StandupWorkbench
        entries={entries}
        currentUserId={session.user.id}
        userTodayEntry={userTodayEntry}
        selectedDate={istDateKey(todayStart)}
        departments={departments}
      />
    </div>
  );
}
