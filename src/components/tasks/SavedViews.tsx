"use client";

/**
 * SavedViews — per-device shared filter presets for the tasks page, stored in
 * localStorage (no DB write, no schema change). "Save current filters" captures
 * the board's active filter state (dept, assignee, priority, search); clicking
 * a saved view restores it via the same onApply callback the filters use.
 * Pre-seeded defaults (My tasks / Overdue / All P0 / My department) appear for
 * everyone; user snapshots append after them.
 */
import { useMemo, useState } from "react";
import { Bookmark, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

const STORE_KEY = "taskboard.savedViews";

export interface SavedView {
  id: string;
  name: string;
  dept?: string;
  assigneeId?: string;
  priority?: string;
  q?: string;
}

interface Props {
  currentUserId: string;
  currentUserName: string;
  active: {
    dept?: string;
    assigneeId?: string;
    priority?: string;
    q?: string;
  };
  onApply: (v: { dept?: string; assigneeId?: string; priority?: string; q?: string }) => void;
}

export function SavedViews({ currentUserId, currentUserName, active, onApply }: Props) {
  const [views, setViews] = useState<SavedView[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const defaults: SavedView[] = useMemo(
    () => [
      { id: "d-my", name: "My tasks", assigneeId: currentUserId },
      { id: "d-overdue", name: "Overdue", q: "overdue" },
      { id: "d-p0", name: "All P0", priority: "P0" },
      { id: "d-dept", name: "My department", dept: "mine" },
    ],
    [currentUserId]
  );

  const activeKey = (v: SavedView) =>
    `${v.dept ?? ""}|${v.assigneeId ?? ""}|${v.priority ?? ""}|${v.q ?? ""}`;
  const activeIsCurrent = (v: SavedView) => {
    const a = `${active.dept ?? ""}|${active.assigneeId ?? ""}|${active.priority ?? ""}|${active.q ?? ""}`;
    return a !== "" && a === activeKey(v);
  };

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }

  function addView() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const v: SavedView = {
      id: `u-${Date.now()}`,
      name: trimmed,
      dept: active.dept,
      assigneeId: active.assigneeId,
      priority: active.priority,
      q: active.q,
    };
    persist([...views, v]);
    setName("");
    setNaming(false);
  }

  function remove(id: string) {
    persist(views.filter((v) => v.id !== id));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-hover bg-raised px-2.5 py-1.5 text-[12px] whitespace-nowrap text-muted transition hover:border-edge hover:text-ink",
          (open || naming) && "border-teal text-ink"
        )}
        title="Saved views"
      >
        <Bookmark className="h-3.5 w-3.5" /> Views
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-hover bg-raised shadow-2xl">
          <div className="border-b border-hover px-3 py-2">
            <div className="label">Saved views</div>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {[...defaults, ...views].map((v) => (
              <li key={v.id} className="group flex items-center">
                <button
                  onClick={() => {
                    onApply({ dept: v.dept, assigneeId: v.assigneeId, priority: v.priority, q: v.q });
                    setOpen(false);
                  }}
                  className={cn(
                    "min-w-0 flex-1 px-3 py-2 text-left text-[12px] text-ink hover:bg-hover",
                    activeIsCurrent(v) && "text-tealhi"
                  )}
                >
                  <span className="truncate">
                    {v.id.startsWith("u-") && <span className="mr-1 text-muted">★</span>}
                    {v.name}
                  </span>
                </button>
                {v.id.startsWith("u-") && (
                  <button
                    onClick={() => remove(v.id)}
                    className="mr-1 rounded p-1 text-muted opacity-0 hover:text-crimson group-hover:opacity-100"
                    title="Delete view"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-hover p-2">
            {!naming && (
              <button
                onClick={() => setNaming(true)}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11.5px] text-teal hover:bg-hover"
              >
                <Plus className="h-3.5 w-3.5" /> Save current filters…
              </button>
            )}
            {naming && (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addView();
                    if (e.key === "Escape") setNaming(false);
                  }}
                  placeholder="Name this view…"
                  className="min-w-0 flex-1 rounded-md border border-hover bg-bg px-2 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
                />
                <button
                  onClick={addView}
                  className="rounded-md bg-teal px-2.5 py-1.5 text-[11px] font-semibold text-white"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}