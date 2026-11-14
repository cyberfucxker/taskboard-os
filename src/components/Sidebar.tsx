"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  House, Lock, Gauge, LayoutGrid, CheckSquare, Users, UsersRound, Package, TrendingUp,
  HeartPulse, Wallet, BrainCircuit, ShieldCheck, LogOut, X, ClipboardList,
  GraduationCap, ListTodo, Sun, Clock, Calendar as CalendarIcon, ChevronDown, Settings as SettingsIcon, Zap,
  Search, SquarePen, PanelLeftClose, Star, Inbox, Building2, History
} from "lucide-react";
import type { ModuleSlug } from "@/lib/nav";
import { visibleSpaces, type SpaceId, type VisibleSpace } from "@/lib/spaces";
import { useNavUser } from "@/components/PageAccessContext";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/rbac";
import { AdminMenu } from "@/components/header/AdminMenu";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useFavorites } from "@/lib/useFavorites";
import { useRecents } from "@/lib/useRecents";

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

export default function Sidebar({
  session, pages, onClose, v3 = true, onSearch, onCompose, onCollapse, onToggleDesign,
}: {
  session: { name?: string | null; email?: string | null; role: string };
  pages: ModuleSlug[];
  onClose?: () => void;
  /** TaskBoard 3 layout (fixed sidebar). false = legacy hover-expand rail. */
  v3?: boolean;
  onSearch?: () => void;
  onCompose?: () => void;
  onCollapse?: () => void;
  onToggleDesign?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const role = session.role;
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>({});
  // Favorites + Recent: both live in localStorage (taskboard3_favs / taskboard3_recents), fed by StarButton / TrackRecent.
  const favs = useFavorites().slice(0, 12);
  const recents = useRecents().slice(0, 6);

  const mobile = !!onClose;

  const fadeIn = mobile
    ? "opacity-100"
    : "opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150";

  const navUser = useNavUser();
  const spaces = visibleSpaces(pages, { role, deptSlug: navUser.deptSlug, deptName: navUser.deptName });

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const go = (path: string) => {
    router.push(path);
    onClose?.();
  };

  /** One flat row per space (no nesting): the row opens its primary page and the rest
   *  of the group shows as tabs on the page itself. */
  const isRowActive = (s: VisibleSpace) => s.matchPaths.some((m) => isActive(m));

  const renderSpace = (s: VisibleSpace) => {
    const SpaceIcon = SPACE_ICONS[s.id];
    const active = isRowActive(s);
    return (
      <div key={s.id} className="mt-0.5">
        <button
          onClick={() => go(s.path)}
          title={mobile ? undefined : s.label}
          aria-current={active ? "page" : undefined}
          data-space={s.id}
          className={cn(
            "flex w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            active ? "bg-surface text-ink font-medium" : "text-muted hover:bg-surface/60 hover:text-ink"
          )}
        >
          <SpaceIcon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-teal" : "text-muted")} />
          <span className={cn("min-w-0 flex-1 text-left whitespace-nowrap overflow-hidden font-medium", fadeIn)}>
            {s.label}
          </span>
          {active && <span className={cn("h-1 w-1 shrink-0 rounded-full bg-teal", fadeIn)} />}
        </button>
      </div>
    );
  };

  /* TaskBoard 3 (Linear) rendering */
  const rowCls = (active: boolean) =>
    cn(
      "tk-row flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[14px] font-medium transition-colors",
      active ? "bg-raised text-ink" : "text-ink2 hover:bg-raised/60 hover:text-ink"
    );

  const renderSpace3 = (s: VisibleSpace) => {
    const SpaceIcon = SPACE_ICONS[s.id];
    const active = isRowActive(s);
    return (
      <button
        key={s.id}
        onClick={() => go(s.path)}
        title={s.label}
        aria-current={active ? "page" : undefined}
        data-space={s.id}
        className={rowCls(active)}
      >
        <SpaceIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{s.label}</span>
      </button>
    );
  };

  const section = (id: string, label: string, body: React.ReactNode) => {
    const open = secOpen[id] ?? true;
    return (
      <div key={id} className="mt-4">
        <button
          onClick={() => setSecOpen((m) => ({ ...m, [id]: !open }))}
          aria-expanded={open}
          className="group/sec flex h-6 w-full items-center gap-1 rounded px-2.5 text-[12px] font-medium text-muted transition hover:text-ink"
        >
          <span>{label}</span>
          <ChevronDown
            className={cn("h-3 w-3 transition", open ? "opacity-0 group-hover/sec:opacity-100" : "-rotate-90 opacity-100")}
          />
        </button>
        {open && <div className="mt-0.5 space-y-0.5">{body}</div>}
      </div>
    );
  };

  if (v3) {
    const iconBtn =
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-ink";
    return (
      <aside
        className={cn("tk-sb flex h-full w-[232px] flex-col overflow-hidden bg-bg", mobile && "border-r border-edge")}
        aria-label="Sidebar"
      >
        {/* Workspace row */}
        <div className="flex h-12 shrink-0 items-center gap-0.5 px-2">
          <button
            onClick={() => go(spaces[0]?.path ?? "/")}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-raised"
            title="TaskBoard"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-teal font-mono text-[10px] font-bold text-white">
              T
            </span>
            <span className="truncate text-[14px] font-semibold tracking-tight text-ink">TaskBoard</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
          </button>
          <button
            className={iconBtn}
            onClick={() => {
              onSearch?.();
              onClose?.();
            }}
            aria-label="Search"
            title="Search (Ctrl K)"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            className={iconBtn}
            onClick={() => {
              onCompose?.();
              onClose?.();
            }}
            aria-label="New task"
            title="New task"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          {mobile ? (
            <button className={iconBtn} onClick={onClose} aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
          ) : (
            onCollapse && (
              <button className={iconBtn} onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse sidebar">
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )
          )}
        </div>

        {/* Spaces */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2 pt-1" aria-label="Spaces">
          <div className="space-y-0.5">{spaces.map(renderSpace3)}</div>
          {favs.length > 0 &&
            section(
              "favorites",
              "Favorites",
              favs.map((f) => (
                <button key={f.path} onClick={() => go(f.path)} className={cn(rowCls(isActive(f.path)), "h-8")}>
                  <Star className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="min-w-0 flex-1 truncate text-left">{f.label}</span>
                </button>
              ))
            )}
          {recents.length > 0 &&
            section(
              "recent",
              "Recent",
              recents.map((r) => (
                <button key={`${r.type}-${r.id}`} onClick={() => go(r.path)} className={cn(rowCls(isActive(r.path)), "h-8")}>
                  <History className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="min-w-0 flex-1 truncate text-left">{r.label}</span>
                </button>
              ))
            )}
        </nav>

        {/* Footer */}
        <div className="shrink-0 p-2">
          {(process.env.NEXT_PUBLIC_DEMO_ROLE_SWITCH === "true" || role === "SUPER_ADMIN") && (
            <div className="mb-1.5">
              <div className="label mb-1.5 px-1 text-[10px]">Viewing as</div>
              <RoleSwitcher role={role} />
            </div>
          )}
          <AdminMenu pages={pages} />
          {onToggleDesign && (
            <button
              onClick={onToggleDesign}
              role="switch"
              aria-checked={true}
              className="mt-0.5 flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted transition-colors hover:bg-raised hover:text-ink"
              title="Switch back to the old layout"
            >
              <span className="min-w-0 flex-1 truncate text-left">New design</span>
              <span className="relative h-4 w-7 shrink-0 rounded-full bg-teal">
                <span className="absolute left-[14px] top-0.5 h-3 w-3 rounded-full bg-bg" />
              </span>
            </button>
          )}
          <div className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <Avatar name={session.name} size={24} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-ink">{session.name ?? "User"}</div>
              <div className="truncate text-[11px] text-muted">{session.email}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="shrink-0 text-muted transition-colors hover:text-crimson"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "group/sb flex flex-col border-r border-edge bg-bg overflow-hidden",
        mobile
          ? "h-full w-[232px]"
          : "absolute inset-y-0 left-0 w-14 hover:w-[232px] transition-[width] duration-200 ease-out z-20"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3.5 py-3.5 shrink-0 border-b border-edge/40">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal font-mono text-xs font-bold text-white shadow-sm">
          TY
        </div>
        <div className={cn("min-w-0 leading-tight whitespace-nowrap overflow-hidden", fadeIn)}>
          <div className="text-[13.5px] font-semibold tracking-tight text-ink">TaskBoard OS</div>
          <div className="text-[10.5px] font-medium text-muted">Acme Inc</div>
        </div>
        {mobile && (
          <button className="ml-auto text-muted hover:text-ink" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Spaces */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {spaces.map(renderSpace)}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-edge p-2">
        {(process.env.NEXT_PUBLIC_DEMO_ROLE_SWITCH === "true" || role === "SUPER_ADMIN") && (
          <div className={cn("overflow-hidden", fadeIn)}>
            <div className="label mb-1.5 px-1 text-[10px]">Viewing as</div>
            <RoleSwitcher role={role} />
          </div>
        )}
        <div className="mt-1.5">
          <AdminMenu pages={pages} fade={fadeIn} />
        </div>
        <div className="mt-1.5 flex items-center gap-2.5 rounded-[10px] border border-edge bg-surface px-2 py-1.5 overflow-hidden">
          <div className="shrink-0">
            <Avatar name={session.name} size={24} />
          </div>
          <div className={cn("min-w-0 flex-1 leading-tight whitespace-nowrap overflow-hidden", fadeIn)}>
            <div className="truncate text-[12.5px] font-medium text-ink">{session.name ?? "User"}</div>
            <div className="truncate font-mono text-[10.5px] text-muted">{session.email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 text-muted hover:text-crimson transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function RoleSwitcher({ role }: { role: string }) {
  const router = useRouter();
  const toast = useToast();
  const { update } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function switchTo(r: string) {
    setBusy(true);
    setOpen(false);
    await update({ role: r }).catch(() => undefined);
    toast(`View switched to ${ROLE_LABELS[r as keyof typeof ROLE_LABELS]}`, "success");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex w-full items-center justify-between rounded-md border border-edge bg-surface px-2.5 py-1 text-left text-[12px] disabled:opacity-60 transition"
      >
        <span className="text-ink">{ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}</span>
        <span className="font-mono text-[10px] text-muted">&#9662;</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-full overflow-y-auto rounded-[10px] border border-edge bg-raised p-1 shadow-popover anim-up">
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              onClick={() => switchTo(r)}
              className={cn(
                "block w-full rounded px-2 py-1.5 text-left text-[11.5px] transition",
                r === role ? "bg-teal/15 text-teal font-medium" : "text-muted hover:bg-hover hover:text-ink"
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
