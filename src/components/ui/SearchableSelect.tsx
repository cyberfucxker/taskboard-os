"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Global inline combobox — type to filter, arrow keys to navigate, Enter to pick.
 * Replaces plain <select> everywhere so every picklist in TaskBoard OS is searchable.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  allowClear = false,
  disabled = false,
  className,
  ariaLabel,
}: {
  options: SelectOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Reset highlight when the list changes.
  useEffect(() => { setHi(0); }, [filtered.length]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Focus the filter input when opened.
  useEffect(() => {
    if (open) { setQuery(""); setHi(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  function pick(o: SelectOption) {
    onChange(o.value);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!open) { setQuery(""); setHi(0); } setOpen((o) => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center justify-between gap-2 h-8 rounded-md border border-edge bg-transparent px-2.5 text-left text-[13px]",
          disabled ? "cursor-not-allowed opacity-50" : "hover:border-faint focus-within:border-teal"
        )}
      >
        <span className={cn("truncate", selected ? "text-ink" : "text-faint")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {allowClear && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
              className="text-muted hover:text-crimson"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-faint" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-[10px] border border-edge bg-raised shadow-popover tk-pop">
          <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Type to filter…"
              className="w-full bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
            />
          </div>
          <ul
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
            onKeyDown={onKey}
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-muted">No matches</li>
            )}
            {filtered.map((o, i) => {
              const isSel = o.value === value;
              const isHi = i === hi;
              return (
                <li key={o.value} role="option" aria-selected={isSel}>
                  <button
                    type="button"
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(o)}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 px-3 text-left text-[13px]",
                      isHi ? "bg-hover" : "",
                      isSel ? "text-tealhi" : "text-ink"
                    )}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {isSel && <Check className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}