"use client";

/**
 * StickyList — page chrome for list pages: header + toolbar stay put at the
 * top (z-index below menus), the list body fills the remaining viewport height
 * with its own scroll (no double scrollbars), and an optional peek pane docks
 * on the right at >= 1536px.
 *
 *   <StickyList header={<PageHeader …/>} toolbar={<ListToolbar …/>} peek={wide ? <Detail/> : null}>
 *     …rows… (use <GroupHeader/> for sticky group headings)
 *   </StickyList>
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useWideScreen } from "./useListFilter";

export function StickyList({
  header,
  toolbar,
  children,
  peek,
  peekWidth = 520,
  className,
  bodyClassName,
}: {
  header?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  /** Rendered as a persistent right pane at >= 1536px when non-null. */
  peek?: React.ReactNode;
  peekWidth?: number;
  className?: string;
  bodyClassName?: string;
}) {
  const wide = useWideScreen();
  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      {(header || toolbar) && (
        <div className="relative z-[5] shrink-0">
          {header}
          {toolbar}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div data-list-body="" className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>
          {children}
        </div>
        {wide && peek ? (
          <aside
            data-peek-pane=""
            style={{ width: peekWidth }}
            className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-edge bg-raised"
          >
            {peek}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

const DONE_RE = /^(done|completed|closed|archived|cancel+ed|lost|won|paid|resolved)$/i;
/** Done / archived style groups start collapsed. */
export function isDoneGroup(name: string): boolean {
  return DONE_RE.test(name.trim());
}

/** Sticky, collapsible group heading with a count. Pass `collapsed`/`onToggle` to control, or let it manage itself. */
export function GroupHeader({
  label,
  count,
  collapsed,
  onToggle,
  defaultCollapsed,
  icon,
  right,
  children,
  className,
}: {
  label: React.ReactNode;
  count?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  defaultCollapsed?: boolean;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  /** When given, rendered below the header and hidden while collapsed. */
  children?: React.ReactNode;
  className?: string;
}) {
  const [own, setOwn] = useState(Boolean(defaultCollapsed));
  const isCollapsed = collapsed ?? own;
  const toggle = onToggle ?? (() => setOwn((c) => !c));
  return (
    <>
      <div className={cn("sticky top-0 z-[4] flex h-8 items-center gap-2 border-b border-line bg-surface px-4", className)}>
        <button type="button" onClick={toggle} aria-expanded={!isCollapsed} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted transition-transform", isCollapsed && "-rotate-90")} />
          {icon}
          <span className="truncate text-[12.5px] font-medium text-ink2">{label}</span>
          {count != null && <span className="tnum text-[12px] text-muted">{count}</span>}
        </button>
        {right}
      </div>
      {!isCollapsed && children}
    </>
  );
}
