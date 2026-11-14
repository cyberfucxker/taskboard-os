"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AlertOctagon, Building2, CheckCircle2, CheckSquare, FolderKanban, History, LayoutDashboard,
  Plus, Play, Star, Target, User,
} from "lucide-react";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useFavorites } from "@/lib/useFavorites";
import { useRecents, type RecentType } from "@/lib/useRecents";
import { useNavUser, usePageAccess } from "@/components/PageAccessContext";
import { visibleSpaces } from "@/lib/spaces";

const TYPE_ICON: Record<RecentType, React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  client: Building2,
  project: FolderKanban,
  person: User,
  lead: Target,
};

const btn =
  "inline-flex h-8 items-center gap-2 rounded-md border border-edge px-2.5 text-[13px] font-medium text-ink2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal disabled:pointer-events-none disabled:opacity-50 xl:w-full";

/**
 * Quick access: the big shortcuts people otherwise scroll or hunt for. On wide
 * screens (>= 1280px) it is a right-hand rail with Recent and Favorites; below that
 * it collapses to a compact wrapping row of buttons under the page header.
 * Handlers are passed in so the host page reuses its own dialogs (blocker,
 * deliverable, focus block) instead of duplicating them.
 */
export function QuickAccess({
  onNewTask,
  onFocus,
  focusDisabled,
  focusActive,
  focusHint,
  onBlocker,
  onSubmit,
  className,
}: {
  onNewTask: () => void;
  onFocus: () => void;
  focusDisabled?: boolean;
  focusActive?: boolean;
  focusHint?: string;
  onBlocker: () => void;
  onSubmit: () => void;
  className?: string;
}) {
  const { data: session } = useSession();
  const pages = usePageAccess();
  const navUser = useNavUser();
  const recents = useRecents().slice(0, 5);
  const favs = useFavorites().slice(0, 6);
  const dept = visibleSpaces([...pages], {
    role: session?.user?.role,
    deptSlug: navUser.deptSlug,
    deptName: navUser.deptName,
  }).find((s) => s.id === "dept");

  return (
    <aside
      aria-label="Quick access"
      className={cn("mb-5 xl:col-start-2 xl:row-start-1 xl:mb-0 xl:self-start xl:sticky xl:top-4", className)}
    >
      <div className="flex flex-wrap gap-2 xl:flex-col xl:flex-nowrap xl:gap-1.5">
        <button type="button" onClick={onNewTask} className={cn(btn, "bg-teal border-transparent text-white hover:bg-tealhi hover:text-white")}>
          <Plus className="h-4 w-4" aria-hidden />
          <span>New task</span>
          <span className="ml-auto hidden xl:inline-flex"><Kbd>C</Kbd></span>
        </button>
        {!focusActive && (
          <button type="button" onClick={onFocus} disabled={focusDisabled} title={focusHint} className={btn}>
            <Play className="h-4 w-4 text-muted" aria-hidden />
            <span>Start focus block</span>
          </button>
        )}
        <button type="button" onClick={onBlocker} className={btn}>
          <AlertOctagon className="h-4 w-4 text-muted" aria-hidden />
          <span>Raise blocker</span>
        </button>
        <button type="button" onClick={onSubmit} className={btn}>
          <CheckCircle2 className="h-4 w-4 text-muted" aria-hidden />
          <span>Submit deliverable</span>
        </button>
        {dept && (
          <Link href={dept.path} className={btn}>
            <LayoutDashboard className="h-4 w-4 text-muted" aria-hidden />
            <span className="truncate">{dept.label === "Departments" ? "Departments" : "My department"}</span>
          </Link>
        )}
      </div>

      <div className="hidden xl:block">
        {recents.length > 0 && (
          <section className="mt-5" aria-label="Recent">
            <h3 className="mb-1 px-1 text-[11px] font-medium text-muted">Recent</h3>
            <ul>
              {recents.map((r) => {
                const Icon = TYPE_ICON[r.type] ?? History;
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <Link
                      href={r.path}
                      className="flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px] text-ink2 hover:bg-hover hover:text-ink"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate">{r.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {favs.length > 0 && (
          <section className="mt-5" aria-label="Favorites">
            <h3 className="mb-1 px-1 text-[11px] font-medium text-muted">Favorites</h3>
            <ul>
              {favs.map((f) => (
                <li key={f.path}>
                  <Link
                    href={f.path}
                    className="flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px] text-ink2 hover:bg-hover hover:text-ink"
                  >
                    <Star className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate">{f.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
