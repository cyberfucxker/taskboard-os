"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Settings as SettingsIcon } from "lucide-react";
import { ROUTES, type ModuleSlug } from "@/lib/nav";
import { visibleAdminPages } from "@/lib/spaces";
import { cn } from "@/lib/cn";

/**
 * R1 step 3 — Settings / Access / Automations / AI / Lock leave the sidebar and
 * live in this avatar/gear menu. Entries are filtered by the same `pages` list
 * the page guards use, so the menu can never offer a link the guard refuses;
 * with no admin page granted the component renders nothing at all.
 *
 * Rendered in the sidebar footer (desktop rail + mobile drawer).
 */
export function AdminMenu({ pages, fade = "" }: { pages: ModuleSlug[]; fade?: string }) {
  const items = visibleAdminPages(pages);
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Admin menu"
        title="Admin"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition",
          open ? "bg-raised text-ink" : "text-muted hover:bg-surface hover:text-ink",
        )}
      >
        <SettingsIcon className="h-4 w-4 shrink-0" />
        <span className={cn("min-w-0 flex-1 text-left whitespace-nowrap overflow-hidden", fade)}>
          Admin
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Admin"
          className="absolute bottom-full left-0 z-30 mb-1 max-h-72 w-52 overflow-y-auto rounded-[10px] border border-edge bg-raised p-1 shadow-popover anim-up"
        >
          <div className="label px-2 py-1">Admin</div>
          {items.map((slug) => {
            const route = ROUTES.find((r) => r.slug === slug);
            if (!route) return null;
            const active = pathname === route.path || pathname.startsWith(route.path + "/");
            return (
              <button
                key={slug}
                role="menuitem"
                onClick={() => go(route.path)}
                title={route.hint}
                className={cn(
                  "block w-full rounded px-2 py-1.5 text-left text-[12.5px] transition",
                  active ? "bg-teal/20 text-teal font-medium" : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                <span className="block truncate">{route.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
