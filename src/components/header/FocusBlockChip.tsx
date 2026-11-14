"use client";

/**
 * FocusBlockChip — header focus-block picker (COO 2026-10-06).
 *
 * Deliberately NOT the T8 focus system (server FocusBlock + clock + WIP guard):
 * no timer starts, no session is recorded, no other task is touched. Start just
 * PATCHes the chosen tasks to IN_PROGRESS (plain status moves, same as the board)
 * and remembers the set in localStorage (`taskboard.focus.{userId}`) so the chip
 * survives navigations and reloads. Ending clears the key; tasks stay IN_PROGRESS.
 */

import { useEffect, useRef, useState } from "react";
import { Zap, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface FocusTask {
  id: string;
  code: string;
  title: string;
  status: string;
  description?: string | null;
}

interface BlockState {
  taskIds: string[];
  startedAt: number;
}

const MAX_TASKS = 3;
const storeKey = (userId: string) => `taskboard.focus.${userId}`;

function readBlock(userId: string): BlockState | null {
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BlockState>;
    if (!Array.isArray(parsed.taskIds) || parsed.taskIds.length === 0) return null;
    return { taskIds: parsed.taskIds.filter((t) => typeof t === "string"), startedAt: 0 };
  } catch {
    return null;
  }
}

export function FocusBlockChip() {
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [block, setBlock] = useState<BlockState | null>(null);
  const [starting, setStarting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const revalidated = useRef(false);

  // Load my tasks, then re-validate any stored block against them (once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/focus/tasks");
        const data = await res.json();
        if (cancelled || !data.ok) return;
        const uid = data.userId as string;
        const list = (data.tasks ?? []) as FocusTask[];
        setUserId(uid);
        setTasks(list);
        if (!revalidated.current) {
          revalidated.current = true;
          const stored = readBlock(uid);
          if (stored) {
            // Stale = gone from my list or no longer IN_PROGRESS. Clear silently.
            const live = stored.taskIds.filter((id) =>
              list.some((t) => t.id === id && t.status === "IN_PROGRESS"),
            );
            if (live.length === 0) {
              try {
                localStorage.removeItem(storeKey(uid));
              } catch {
                /* ignore */
              }
            } else {
              if (live.length !== stored.taskIds.length) {
                try {
                  localStorage.setItem(
                    storeKey(uid),
                    JSON.stringify({ taskIds: live, startedAt: Date.now() }),
                  );
                } catch {
                  /* ignore */
                }
              }
              setBlock({ taskIds: live, startedAt: Date.now() });
            }
          }
        }
      } catch {
        /* offline — chip stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  if (!userId) return null;

  const byId = new Map(tasks.map((t) => [t.id, t]));

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TASKS) return prev;
      return [...prev, id];
    });
  }

  async function startBlock() {
    if (selected.length === 0 || starting || !userId) return;
    setStarting(true);
    const already = selected.filter((id) => byId.get(id)?.status === "IN_PROGRESS");
    const toStart = selected.filter((id) => byId.get(id)?.status !== "IN_PROGRESS");
    const started: string[] = [];
    const failed: string[] = [];
    for (const id of toStart) {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", status: "IN_PROGRESS" }),
        });
        const data = await res.json();
        if (res.ok && data.ok) started.push(id);
        else failed.push(byId.get(id)?.code ?? id);
      } catch {
        failed.push(byId.get(id)?.code ?? id);
      }
    }
    const okIds = [...already, ...started];
    setStarting(false);
    if (okIds.length === 0) {
      toast(failed.length > 0 ? `Could not start: ${failed.join(", ")}` : "Nothing started", "error");
      return;
    }
    try {
      localStorage.setItem(storeKey(userId), JSON.stringify({ taskIds: okIds, startedAt: Date.now() }));
    } catch {
      /* ignore */
    }
    setBlock({ taskIds: okIds, startedAt: Date.now() });
    setSelected([]);
    setPickerOpen(false);
    toast(
      failed.length > 0
        ? `${okIds.length} in focus · ${failed.length} need a description first`
        : okIds.length === 1
          ? "Focus block started · 1 task"
          : `Focus block started · ${okIds.length} tasks`,
      failed.length > 0 ? "error" : "success",
    );
  }

  function endBlock() {
    if (!userId) return;
    try {
      localStorage.removeItem(storeKey(userId));
    } catch {
      /* ignore */
    }
    setBlock(null);
    setSelected([]);
  }

  // ---- active state ----
  if (block) {
    const codes = block.taskIds.map((id) => byId.get(id)?.code ?? "···").slice(0, MAX_TASKS);
    return (
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-[12px] text-ink">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-teal" aria-label="Focus block active" />
        <span className="hidden font-mono tabular-nums md:inline">{codes.join(" · ")}</span>
        <span className="font-mono tabular-nums md:hidden" aria-label={`${block.taskIds.length} tasks in focus`}>
          ⚡{block.taskIds.length}
        </span>
        <button
          type="button"
          onClick={endBlock}
          className="ml-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted transition hover:bg-teal/20 hover:text-ink"
          aria-label="End focus block (tasks stay In Progress)"
          title="End focus block — tasks stay In Progress"
        >
          End
        </button>
      </div>
    );
  }

  // ---- inactive state ----
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        aria-expanded={pickerOpen}
        aria-label="Start a focus block"
        title="Focus on up to 3 tasks"
        className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-2.5 py-1 text-[12px] font-medium text-muted transition hover:border-teal/60 hover:text-ink"
      >
        <Zap className="h-3.5 w-3.5 text-teal" />
        <span className="hidden sm:inline">Focus Block</span>
      </button>

      {pickerOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-edge bg-raised shadow-2xl">
          <div className="border-b border-edge px-3 py-2 text-[12px] font-semibold text-ink">
            Focus on up to {MAX_TASKS}
            <span className="ml-1.5 font-normal text-muted">
              {selected.length}/{MAX_TASKS} selected
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {tasks.length === 0 && (
              <p className="px-2 py-3 text-center text-[12px] text-muted">
                No TODO or IN_PROGRESS tasks assigned to you.
              </p>
            )}
            {tasks.map((t) => {
              const checked = selected.includes(t.id);
              const capped = !checked && selected.length >= MAX_TASKS;
              const hasDesc = (t.description ?? '').trim().length > 0;
              const disabled = capped || !hasDesc;
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition",
                    disabled ? "cursor-not-allowed opacity-40" : "hover:bg-hover",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(t.id)}
                    className="h-3.5 w-3.5 shrink-0 accent-teal"
                    aria-label={`Focus ${t.code}: ${t.title}`}
                  />
                  <span className="w-14 shrink-0 font-mono text-[11px] text-muted">{t.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{t.title}</span>
                    {!hasDesc && (
                      <span className="mt-0.5 block text-[11px] font-medium text-amber">
                        add a description to include in focus
                      </span>
                    )}
                  </span>
                  {t.status === "IN_PROGRESS" && (
                    <span className="shrink-0 rounded bg-teal/15 px-1 py-px font-mono text-[10px] text-tealhi">
                      IP
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-edge px-3 py-2">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-md px-2 py-1 text-[12px] text-muted hover:text-ink"
              aria-label="Close focus picker"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={startBlock}
              disabled={selected.length === 0 || starting}
              className="rounded-md bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-tealhi disabled:opacity-50"
            >
              {starting ? "Starting…" : `Start Focus Block${selected.length > 0 ? ` (${selected.length})` : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
