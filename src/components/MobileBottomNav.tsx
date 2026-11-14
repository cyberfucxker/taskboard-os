"use client";

import { Fragment } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Building2, CheckSquare, Gauge, House, Inbox, Plus, TrendingUp, Users, UsersRound } from "lucide-react";
import { createTask } from "@/lib/task-drawer";
import { usePageAccess, useNavUser } from "@/components/PageAccessContext";
import { bottomBarSpaces, type SpaceId } from "@/lib/spaces";

const SPACE_ICONS: Record<SpaceId, React.ComponentType<{ className?: string }>> = {
  home: House,
  inbox: Inbox,
  tasks: CheckSquare,
  dept: Building2,
  sales: Users,
  clients: TrendingUp,
  team: UsersRound,
  insights: Gauge,
};

/**
 * Phone bottom bar (Lane G): Home, Inbox, Tasks, +, Department.
 *
 * Tabs come from the same grant list the sidebar and guardPage() use, via
 * bottomBarSpaces(); the Department tab links to the viewer's OWN department only
 * (Leadership / SUPER_ADMIN get the roll-up). Everything else stays reachable
 * through the hamburger drawer, which renders the full filtered sidebar.
 */
export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const pages = usePageAccess();
  const user = useNavUser();

  type Tab = { id: SpaceId; label: string; path: string; match: string[]; Icon: React.ComponentType<{ className?: string }> };
  const tabs: Tab[] = bottomBarSpaces(pages, user).map((space) => ({
    id: space.id,
    label: space.id === "dept" && space.label.length > 10 ? space.label.slice(0, 9) + "..." : space.label,
    path: space.path,
    match: space.matchPaths,
    Icon: SPACE_ICONS[space.id],
  }));

  function isActive(tab: Tab) {
    return tab.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
  }

  function go(path: string) {
    router.push(path);
  }

  const hasTasks = tabs.some((t) => t.id === "tasks");
  const createBtn = (
      <button
        data-tab="create"
        onClick={() => createTask()}
        className="group flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-transform active:scale-90"
        style={{ minHeight: 48 }}
        aria-label="Create task"
        title="Create task"
      >
        <span className="flex h-7 w-12 items-center justify-center rounded-full bg-teal/20 text-teal shadow-sm ring-1 ring-teal/30 transition-all duration-200">
          <Plus className="h-5 w-5" />
        </span>
        <span className="text-[10px] tracking-tight text-teal font-semibold">+</span>
      </button>
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-edge bg-surface/95 backdrop-blur-2xl pb-safe"
      style={{ height: "var(--bnav)" }}
      aria-label="Primary Mobile Navigation"
    >
      {tabs.map((tab) => {
        const active = isActive(tab);
        return (
          <Fragment key={tab.id}>
          <button
            data-tab={tab.id}
            onClick={() => go(tab.path)}
            className="group flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-transform active:scale-90"
            style={{ minHeight: 48 }}
            aria-current={active ? "page" : undefined}
          >
            <span
              className={`flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 ${
                active ? "bg-teal/20 text-teal shadow-sm ring-1 ring-teal/30" : "text-muted group-hover:text-ink"
              }`}
            >
              <tab.Icon className="h-5 w-5" />
            </span>
            <span className={`text-[10px] tracking-tight ${active ? "text-teal font-semibold" : "text-muted"}`}>
              {tab.label}
            </span>
          </button>
          {tab.id === "tasks" && createBtn}
          </Fragment>
        );
      })}

      {!hasTasks && createBtn}
    </nav>
  );
}
