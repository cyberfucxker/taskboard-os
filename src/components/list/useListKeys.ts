"use client";

/**
 * useListKeys — J/K (or arrows) move a "selected row" through `ids`, Enter opens it.
 * Rows opt in with data-row-id={id}; the selected one gets scrolled into view.
 * Ignored while typing, with modifiers held, or while a dialog is open.
 */
import { useEffect, useRef } from "react";

function typing(el: Element | null): boolean {
  return Boolean((el as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

export function useListKeys({
  ids,
  activeId,
  onActive,
  onOpen,
  enabled = true,
}: {
  ids: string[];
  activeId: string | null;
  onActive: (id: string) => void;
  onOpen?: (id: string) => void;
  enabled?: boolean;
}) {
  const state = useRef({ ids, activeId, onActive, onOpen });
  state.current = { ids, activeId, onActive, onOpen };

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (typing(document.activeElement)) return;
      if (document.querySelector("[role='dialog'], [data-task-drawer], [data-picker-content]")) return;
      const { ids, activeId, onActive, onOpen } = state.current;
      const k = e.key;
      if (k === "j" || k === "J" || k === "k" || k === "K") {
        if (ids.length === 0) return;
        e.preventDefault();
        const dir = k === "j" || k === "J" ? 1 : -1;
        const i = activeId ? ids.indexOf(activeId) : -1;
        const next = i === -1 ? (dir > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + dir));
        onActive(ids[next]);
        requestAnimationFrame(() =>
          document.querySelector(`[data-row-id="${CSS.escape(ids[next])}"]`)?.scrollIntoView({ block: "nearest" })
        );
      } else if (k === "Enter" && activeId && onOpen) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && ae !== document.body && ae.closest("button, a, [role='button']")) return;
        e.preventDefault();
        onOpen(activeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
