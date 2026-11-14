"use client";

import { useEffect, useRef, useState } from "react";
import { extractTaskCodeFromText } from "@/lib/taskCode";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Search, ExternalLink, HelpCircle, PanelLeft } from "lucide-react";
import { OnboardingModal, ONBOARDING_KEY } from "@/components/guide/OnboardingModal";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeToggle } from "@/components/ThemeProvider";
import { FocusBlockChip } from "@/components/header/FocusBlockChip";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ActiveBreakBanner } from "@/components/timer/ActiveBreakBanner";
import { Kbd, Dot } from "@/components/ui";
import { ROUTES, type ModuleSlug } from "@/lib/nav";
import { createTask, openTask } from "@/lib/task-drawer";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/cn";

/** Per-user "new design" switch (localStorage `taskboard3`: on | off). Fallback is server `uiVersion`. */
const DESIGN_KEY = "taskboard3";
const SB_KEY = "taskboard3_sb";

export interface AppNotification {
  id: string;
  title: string;
  detail?: string | null;
  severity?: string;
  createdAt?: string;
}

function timeAgo(dateIso?: string): string {
  if (!dateIso) return "";
  const sec = Math.floor((Date.now() - new Date(dateIso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function AppShell({
  session,
  pages,
  children,
  notifications = [],
  uiVersion = "v3",
}: {
  session: { name?: string | null; email?: string | null; role: string };
  pages: ModuleSlug[];
  children: React.ReactNode;
  notifications?: AppNotification[];
  uiVersion?: "v3" | "v2";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const notifWrap = useRef<HTMLDivElement>(null);
  const [v3, setV3] = useState(uiVersion === "v3");
  const [sbCollapsed, setSbCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DESIGN_KEY);
      if (saved === "off") {
        setV3(false);
        document.documentElement.setAttribute("data-ui", "v2");
      } else if (saved === "on") {
        setV3(true);
        document.documentElement.setAttribute("data-ui", "v3");
      } else {
        setV3(uiVersion === "v3");
        document.documentElement.setAttribute("data-ui", uiVersion);
      }
      if (window.localStorage.getItem(SB_KEY) === "1") setSbCollapsed(true);
    } catch { /* ignore */ }
  }, [uiVersion]);

  function setDesign(on: boolean) {
    setV3(on);
    try {
      window.localStorage.setItem(DESIGN_KEY, on ? "on" : "off");
      document.documentElement.setAttribute("data-ui", on ? "v3" : "v2");
    } catch { /* ignore */ }
  }

  function toggleSidebar() {
    setSbCollapsed((c) => {
      try {
        window.localStorage.setItem(SB_KEY, c ? "0" : "1");
      } catch { /* ignore */ }
      return !c;
    });
  }

  const current = ROUTES.find((r) => pathname.startsWith(r.path));

  // One registry for global shortcuts (Cmd/Ctrl+K, C, /, G+letter, ?, Esc): src/lib/shortcuts.ts
  useGlobalShortcuts({
    pages,
    togglePalette: () => setPaletteOpen((o) => !o),
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
    onEscape: () => {
      if (helpOpen) { setHelpOpen(false); return true; }
      if (paletteOpen) { setPaletteOpen(false); return true; }
      return false;
    },
    createTask: () => createTask(),
    navigate: (path) => router.push(path),
    layerOpen: paletteOpen || helpOpen,
  });

  useEffect(() => setMobileNav(false), [pathname]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ONBOARDING_KEY)) setShowGuide(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!showNotifs) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (notifWrap.current && !notifWrap.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setShowNotifs(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onEscape);
    };
  }, [showNotifs]);

  function closeGuide() {
    try {
      window.localStorage.setItem(ONBOARDING_KEY, "1");
    } catch { /* ignore */ }
    setShowGuide(false);
  }

  const unread = notifications.length;

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
    setShowNotifs(false);
    router.refresh();
  }

  async function clearAll() {
    await fetch("/api/notifications/clear", { method: "DELETE" }).catch(() => {});
    setShowNotifs(false);
    router.refresh();
  }

  async function handleNotificationClick(n: AppNotification) {
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: n.id }),
    }).catch(() => {});

    setShowNotifs(false);

    const fullText = `${n.title} ${n.detail ?? ""}`;
    const taskCodeInText = extractTaskCodeFromText(fullText);
    if (taskCodeInText) {
      openTask(taskCodeInText);
      return;
    }

    if (/lead|crm|deal/i.test(fullText)) {
      router.push("/crm");
      return;
    }
    if (/project/i.test(fullText)) {
      router.push("/projects");
      return;
    }
    if (/lms|course/i.test(fullText)) {
      router.push("/lms");
      return;
    }
    if (/time|shift|hours/i.test(fullText)) {
      router.push("/today");
      return;
    }

    router.refresh();
  }

  return (
    <div
      className="tk-shell flex h-[100dvh] overflow-hidden bg-bg"
      data-taskboard3={v3 ? "on" : "off"}
      data-sb={sbCollapsed ? "collapsed" : "open"}
    >
      {/* Desktop sidebar: fixed 232px (TaskBoard 3) or hover-expand rail (old design) */}
      {v3 ? (
        <div className="tk-sb-col hidden lg:block h-full shrink-0 overflow-hidden" aria-hidden={sbCollapsed || undefined}>
          <Sidebar
            session={session}
            pages={pages}
            v3
            onSearch={() => setPaletteOpen(true)}
            onCompose={() => createTask()}
            onCollapse={toggleSidebar}
            onToggleDesign={() => setDesign(false)}
          />
        </div>
      ) : (
        <div className="hidden lg:block relative h-full w-14 shrink-0">
          <Sidebar session={session} pages={pages} v3={false} />
        </div>
      )}

      {/* Mobile drawer menu */}
      {mobileNav && (
        <div className="fixed inset-0 z-[80] flex lg:hidden">
          <div className="h-full anim-left shrink-0 z-10">
            <Sidebar
              session={session}
              pages={pages}
              v3={v3}
              onClose={() => setMobileNav(false)}
              onSearch={() => setPaletteOpen(true)}
              onCompose={() => createTask()}
              onToggleDesign={() => setDesign(!v3)}
            />
          </div>
          <div className="flex-1 bg-black/50 anim-fade" onClick={() => setMobileNav(false)} />
        </div>
      )}

      <div className="tk-main flex min-w-0 flex-1 flex-col">
       <div className="tk-panel flex min-h-0 flex-1 flex-col">
        {/* ── Linear Precision Header ── */}
        <header className="tk-header flex h-11 shrink-0 items-center gap-2.5 border-b border-edge bg-bg px-3 lg:px-4">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded text-muted hover:text-ink hover:bg-hover transition-colors"
            onClick={() => setMobileNav(true)}
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>

          {/* Re-open sidebar (TaskBoard 3, desktop, when collapsed) */}
          {v3 && sbCollapsed && (
            <button
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded text-muted hover:text-ink hover:bg-hover transition-colors"
              onClick={toggleSidebar}
              aria-label="Show sidebar"
              title="Show sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          {/* Page title */}
          <div className="min-w-0 mr-2 flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink tracking-tight">
              {current?.label ?? "Workspace"}
            </span>
          </div>

          {/* Expandable search (desktop) */}
          <div className="hidden flex-1 md:block max-w-sm">
            <GlobalSearch />
          </div>
          <div className="flex-1 md:hidden" />

          {/* ⌘K trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="tk-jump hidden sm:flex items-center gap-2 rounded-md border border-edge bg-surface px-2 py-1 text-[11.5px] text-muted transition hover:border-[var(--border-default)] hover:text-ink"
          >
            <Search className="h-3 w-3" />
            <span className="hidden md:inline">Jump…</span>
            <Kbd>⌘K</Kbd>
          </button>


          {/* Focus block */}
          <FocusBlockChip />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <div className="relative" ref={notifWrap}>
            <button
              onClick={() => setShowNotifs((o) => !o)}
              className="relative flex h-8 w-8 items-center justify-center rounded text-muted hover:text-ink hover:bg-hover transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-crimson" />
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-10 z-[90] w-80 sm:w-96 max-w-[calc(100vw-24px)] overflow-hidden rounded-[10px] border border-edge bg-raised shadow-popover anim-up">
                <div className="flex items-center justify-between border-b border-edge px-3 py-2 bg-surface/50">
                  <span className="label text-[10.5px]">Notifications</span>
                  {notifications.length > 0 && (
                    <div className="flex items-center gap-3">
                      <button onClick={markAllRead} className="text-[11px] font-medium text-teal hover:underline">
                        Mark read
                      </button>
                      <button onClick={clearAll} className="text-[11px] font-medium text-crimson hover:underline">
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs text-muted">You&apos;re all caught up</div>
                ) : (
                  <div className="max-h-96 overflow-y-auto divide-y divide-line">
                    {notifications.map((n) => {
                      const taskMatch = extractTaskCodeFromText(`${n.title} ${n.detail ?? ""}`);
                      return (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className="group flex cursor-pointer items-start gap-2.5 p-3 transition hover:bg-hover"
                        >
                          <Dot color={n.severity === "Critical" ? "var(--crimson)" : n.severity === "High" ? "var(--amber)" : "var(--teal)"} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[12.5px] font-medium text-ink group-hover:text-teal transition-colors">
                                {n.title}
                              </span>
                              {n.createdAt && (
                                <span className="shrink-0 text-[10px] text-muted">
                                  {timeAgo(n.createdAt)}
                                </span>
                              )}
                            </div>
                            {n.detail && (
                              <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted leading-relaxed">
                                {n.detail}
                              </p>
                            )}
                            {taskMatch && (
                              <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-teal">
                                <ExternalLink className="h-2.5 w-2.5" />
                                <span>Open {taskMatch[1].toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {!v3 && (
            <button
              onClick={() => setDesign(true)}
              className="rounded-md border border-edge px-2 py-1 text-[11.5px] font-medium text-muted transition hover:bg-hover hover:text-ink"
            >
              Try new design
            </button>
          )}

          {/* Help */}
          <button
            onClick={() => setShowGuide(true)}
            aria-label="Guide"
            title="Quick guide"
            className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* ── Active Break Banner ── */}
        <ActiveBreakBanner />

        {/* ── Content ── */}
        <main className="min-h-0 flex-1 main-scrollable">{children}</main>
       </div>

        {/* ── Mobile bottom nav ── */}
        <MobileBottomNav />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} onHelp={() => setHelpOpen(true)} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <OnboardingModal open={showGuide} onClose={closeGuide} />

      {/* Floating Linear Task Creator */}
      <button
        onClick={() => createTask()}
        className={cn(
          "fixed bottom-[calc(var(--bnav)+12px)] right-4 z-30 flex items-center gap-1.5 rounded-full bg-teal px-3.5 py-2.5 text-[12.5px] font-semibold text-white shadow-popover hover:bg-tealhi active:scale-95 transition-all lg:bottom-5",
          v3 && "lg:hidden"
        )}
        aria-label="New task"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>New Issue</span>
      </button>
    </div>
  );
}
