"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, CheckSquare, Building2, FolderKanban, User, GraduationCap, Loader2 } from "lucide-react";
import { Kbd } from "@/components/ui";
import { entityUrl } from "@/lib/url";
import type { SearchResults } from "@/app/api/search/route";

const GROUPS: Array<{ key: keyof SearchResults; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "clients", label: "Clients", icon: Building2 },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "people", label: "People", icon: User },
  { key: "courses", label: "Learning", icon: GraduationCap },
];

function hrefFor(group: keyof SearchResults, id: string): string {
  if (group === "tasks") return entityUrl("task", id);
  if (group === "clients") return entityUrl("client", id);
  if (group === "projects") return entityUrl("project", id);
  if (group === "people") return entityUrl("person", id);
  return `/lms/${id}`;
}

/**
 * Global search — one box that finds a task, client, project, person, or
 * learning module from anywhere in the app. Cmd/Ctrl+K focuses it; results
 * are scoped server-side by /api/search exactly like each entity's own page
 * would scope them, so nothing shows up here that the viewer couldn't
 * already open directly.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && e.shiftKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.ok) setResults(data.results);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const totalCount = results ? GROUPS.reduce((n, g) => n + results[g.key].length, 0) : 0;

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-1.5 text-[13px] text-muted transition focus-within:border-teal">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search anything…"
          className="w-full min-w-0 bg-transparent text-ink placeholder:text-muted focus:outline-none"
        />
        {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Kbd>⇧⌘F</Kbd>}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-10 z-40 max-h-[70vh] overflow-y-auto rounded-[10px] border border-edge bg-raised shadow-popover anim-up">
          {!results ? (
            <div className="px-3 py-6 text-center text-xs text-muted">Searching…</div>
          ) : totalCount === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">No matches for "{query}"</div>
          ) : (
            GROUPS.map((g) => {
              const items = results[g.key];
              if (items.length === 0) return null;
              const Icon = g.icon;
              return (
                <div key={g.key} className="border-b border-edge/60 py-1.5 last:border-b-0">
                  <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    {g.label}
                  </div>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={hrefFor(g.key, item.id)}
                      onClick={() => { setOpen(false); setQuery(""); }}
                      className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-ink hover:bg-hover transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <span className="truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="ml-auto shrink-0 truncate text-[11px] text-muted">{item.sublabel}</span>
                      )}
                    </Link>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
