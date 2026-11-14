"use client";

import { useEffect, useRef } from "react";
import type { ModuleSlug } from "@/lib/nav";

/**
 * ONE registry for global keyboard shortcuts. The help dialog renders SHORTCUTS and
 * `useGlobalShortcuts` implements them, so what is listed is what works.
 *
 * Single-key shortcuts are ignored while an input / textarea / select / contenteditable
 * has focus (or a modifier is held); only Cmd/Ctrl+K and Esc work there.
 */

export interface ShortcutDef {
  id: string;
  /** Display keys, one entry per key press, e.g. ["G", "T"]. */
  keys: string[];
  label: string;
  group: "General" | "Create" | "Go to";
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");

export const SHORTCUTS: ShortcutDef[] = [
  { id: "palette", keys: ["mod", "K"], label: "Open command palette", group: "General" },
  { id: "help", keys: ["?"], label: "Show keyboard shortcuts", group: "General" },
  { id: "filter", keys: ["/"], label: "Focus this page's filter", group: "General" },
  { id: "esc", keys: ["Esc"], label: "Close dialog / palette", group: "General" },
  { id: "create", keys: ["C"], label: "Create task", group: "Create" },
  { id: "go-home", keys: ["G", "H"], label: "Go to Home", group: "Go to" },
  { id: "go-tasks", keys: ["G", "T"], label: "Go to Tasks", group: "Go to" },
  { id: "go-clients", keys: ["G", "C"], label: "Go to Clients", group: "Go to" },
  { id: "go-projects", keys: ["G", "P"], label: "Go to Projects", group: "Go to" },
  { id: "go-mywork", keys: ["G", "M"], label: "Go to My work", group: "Go to" },
];

/** G-then-letter targets; a target is only reachable if its page is granted. */
export const GO_TARGETS: Record<string, { slug: ModuleSlug; path: string }> = {
  h: { slug: "Home", path: "/" },
  t: { slug: "Tasks", path: "/tasks" },
  c: { slug: "Clients", path: "/clients" },
  p: { slug: "Projects", path: "/projects" },
  m: { slug: "My Work", path: "/my-work" },
};

export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/** True while some other modal dialog (not our palette/help) is open. */
function otherDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [aria-modal="true"]');
}

export interface ShortcutHandlers {
  pages: readonly ModuleSlug[];
  /** Toggle the palette (Cmd/Ctrl+K). */
  togglePalette: () => void;
  openPalette: () => void;
  openHelp: () => void;
  /** Esc: close whatever shortcut-owned layer is open. Return true if something closed. */
  onEscape: () => boolean;
  createTask: () => void;
  navigate: (path: string) => void;
  /** True while palette or help is open: single-key shortcuts pause. */
  layerOpen: boolean;
}

export function useGlobalShortcuts(h: ShortcutHandlers): void {
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    let goPending = false;
    let goTimer: ReturnType<typeof setTimeout> | undefined;
    const clearGo = () => {
      goPending = false;
      if (goTimer) clearTimeout(goTimer);
    };

    const onKey = (e: KeyboardEvent) => {
      const cur = ref.current;
      const key = e.key;

      if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === "k") {
        e.preventDefault();
        clearGo();
        cur.togglePalette();
        return;
      }
      if (key === "Escape") {
        clearGo();
        cur.onEscape();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target) || cur.layerOpen || otherDialogOpen()) {
        clearGo();
        return;
      }

      const k = key.toLowerCase();

      if (goPending) {
        clearGo();
        const target = GO_TARGETS[k];
        if (target && cur.pages.includes(target.slug)) {
          e.preventDefault();
          // Capture phase + stop: page-level single-key handlers (e.g. task detail P/S/A/D)
          // must not also react to the second key of a G-chord.
          e.stopPropagation();
          cur.navigate(target.path);
        }
        return;
      }

      if (key === "?") {
        e.preventDefault();
        cur.openHelp();
      } else if (key === "/") {
        const input = Array.from(document.querySelectorAll<HTMLElement>("[data-page-filter]")).find(
          (n) => n.offsetParent !== null
        );
        e.preventDefault();
        if (input) input.focus();
        else cur.openPalette();
      } else if (k === "c" && !e.shiftKey) {
        e.preventDefault();
        cur.createTask();
      } else if (k === "g" && !e.shiftKey) {
        goPending = true;
        goTimer = setTimeout(clearGo, 1200);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearGo();
    };
  }, []);
}
