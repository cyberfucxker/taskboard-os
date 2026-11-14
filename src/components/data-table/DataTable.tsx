"use client";

/**
 * DataTable — the one shared table for every list (taskboard-ui-system
 * "Component base"). TanStack Table v9 drives sorting + row-selection state
 * underneath; all markup is token classes owned here.
 *
 * Contract: column defs, client sort (or server sort via manualSorting),
 * sticky header, checkbox select with shift-range, batch-action bar slot,
 * J/K/X/Enter keyboard nav, skeleton rows, empty-state slot, server
 * pagination hooks, card layout below 768px.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFns,
  tableFeatures,
  useTable,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import type { DataColumn, HideBelow, ServerPagination, SortDir, SortState } from "./types";
import {
  addRangeToSet,
  isEditableTarget,
  moveActiveIndex,
  rangeIdsBetween,
  toggleIdInSet,
} from "./selection";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

const HIDE_CLASS: Record<HideBelow, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export interface MobileRowContext {
  selected: boolean;
  active: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  /** Controlled client sort. Omit + manualSorting for server-driven lists. */
  sort?: SortState | null;
  onSortChange?: (s: SortState) => void;
  /** Server-driven: TanStack skips reordering, parent refetches on onSortChange. */
  manualSorting?: boolean;
  /** Controlled selection (parent owns it for the batch bar). */
  selected?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  selectable?: boolean;
  /** Row click (Enter key calls this with the active row id). */
  onOpen?: (id: string) => void;
  /** Rendered when selection is non-empty (parent owns sticky styling). */
  bulkBar?: React.ReactNode;
  /** Loading skeleton state. */
  loading?: boolean;
  skeletonRows?: number;
  /** Shown when rows is empty and not loading. */
  empty?: React.ReactNode;
  /** Server pagination hooks. Omit for client-side (all rows shown). */
  pagination?: ServerPagination;
  /** Card renderer for <768px. Falls back to first-column text. */
  renderMobileCard?: (row: T, ctx: MobileRowContext) => React.ReactNode;
  ariaLabel?: string;
  /** Row density: cell padding. Default "compact". */
  size?: "compact" | "comfortable";
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    rows,
    columns,
    getRowId,
    sort,
    onSortChange,
    manualSorting = false,
    selected,
    onSelectionChange,
    selectable = true,
    onOpen,
    bulkBar,
    loading = false,
    skeletonRows = 8,
    empty,
    pagination,
    renderMobileCard,
    ariaLabel = "Data table",
    size = "compact",
  } = props;

  const uncontrolledSelection = useState<Set<string>>(new Set());
  const sel = selected ?? uncontrolledSelection[0];
  const setSel = onSelectionChange ?? uncontrolledSelection[1];

  const columnHelper = useMemo(() => createColumnHelper<typeof features, RowData>(), []);

  // Public T stays unconstrained (callers use interfaces like TaskView, which
  // cannot extend RowData); the T<->RowData seam is cast in these adapters
  // only. Everything TanStack-side below is fully typed and tsc-verified.
  const tanstackColumns = useMemo(
    () =>
      columns.map((c) =>
        columnHelper.accessor((row: RowData): unknown => c.accessor(row as T), {
          id: c.id,
          header: c.header,
          enableSorting: c.enableSorting ?? true,
          sortDescFirst: c.sortDescFirst ?? false,
          sortFn: c.sortFn
            ? (rowA, rowB) => c.sortFn!((rowA.original as T), (rowB.original as T))
            : sortFn_basic,
        })
      ),
    [columnHelper, columns]
  );

  // Bridge public SortState <-> TanStack SortingState.
  const tsSorting: SortingState = useMemo(() => {
    if (!sort) return [];
    return [{ id: sort.key, desc: sort.dir === -1 }];
  }, [sort]);

  const rowSelection: RowSelectionState = useMemo(() => {
    const o: RowSelectionState = {};
    sel.forEach((id) => {
      o[id] = true;
    });
    return o;
  }, [sel]);

  const table = useTable({
    features,
    data: rows as RowData[],
    columns: tanstackColumns,
    getRowId: (row: RowData) => getRowId(row as T),
    state: { sorting: tsSorting, rowSelection },
    onSortingChange: (updater) => {
      const next: SortingState =
        typeof updater === "function" ? updater(tsSorting) : updater;
      const first = next[0];
      if (!onSortChange || !first) return;
      onSortChange({ key: first.id, dir: first.desc ? -1 : 1 });
    },
    onRowSelectionChange: (updater) => {
      const next: RowSelectionState =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setSel(new Set(Object.keys(next).filter((k) => next[k])));
    },
    manualSorting,
    enableRowSelection: selectable,
  });

  const orderedRows = table.getRowModel().rows;
  const orderedIds = useMemo(() => orderedRows.map((r) => r.id), [orderedRows]);

  // Keyboard-active row (id, not index — survives re-sorts).
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastAnchor = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (activeId !== null && !orderedIds.includes(activeId)) setActiveId(null);
    if (lastAnchor.current !== null && !orderedIds.includes(lastAnchor.current)) {
      lastAnchor.current = null;
    }
  }, [orderedIds, activeId]);

  const activeIndex = activeId === null ? null : orderedIds.indexOf(activeId);

  function scrollActiveIntoView(id: string) {
    rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
  }

  function selectRow(id: string, shiftKey: boolean) {
    if (!selectable) return;
    if (shiftKey && lastAnchor.current !== null) {
      setSel(addRangeToSet(sel, rangeIdsBetween(orderedIds, lastAnchor.current, id)));
    } else {
      setSel(toggleIdInSet(sel, id));
      lastAnchor.current = id;
    }
  }

  function toggleSortKey(key: string) {
    const col = columns.find((c) => c.id === key);
    if (!col || (col.enableSorting ?? true) === false || !onSortChange) return;
    if (!sort || sort.key !== key) {
      onSortChange({ key, dir: (col.sortDescFirst ? -1 : 1) as SortDir });
    } else {
      onSortChange({ key, dir: (sort.dir === 1 ? -1 : 1) as SortDir });
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (isEditableTarget(e.target)) {
      if (e.key !== "Escape") return;
    }
    const k = e.key;
    if (k === "j" || k === "J" || k === "ArrowDown") {
      e.preventDefault();
      const next = moveActiveIndex(activeIndex, 1, orderedIds.length);
      if (next !== null) {
        setActiveId(orderedIds[next]);
        scrollActiveIntoView(orderedIds[next]);
      }
    } else if (k === "k" || k === "K" || k === "ArrowUp") {
      e.preventDefault();
      const next = moveActiveIndex(activeIndex, -1, orderedIds.length);
      if (next !== null) {
        setActiveId(orderedIds[next]);
        scrollActiveIntoView(orderedIds[next]);
      }
    } else if (k === "x" || k === "X") {
      if (activeId !== null && !e.shiftKey) {
        e.preventDefault();
        selectRow(activeId, false);
      }
    } else if (k === "Enter") {
      if (activeId !== null && onOpen) {
        e.preventDefault();
        onOpen(activeId);
      }
    } else if (k === "Escape") {
      setSel(new Set());
      setActiveId(null);
    }
  }

  const allSel = orderedRows.length > 0 && table.getIsAllRowsSelected();
  const someSel = table.getIsSomeRowsSelected();
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSel && !allSel;
  }, [someSel, allSel]);

  const arrowFor = (key: string) =>
    sort?.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "";

  const cellPad = size === "comfortable" ? "py-3.5" : "py-2.5";

  const headerCls =
    "cursor-pointer select-none px-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted hover:text-ink transition-colors";

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {/* Desktop table */}
      <div className="hidden min-h-0 flex-1 overflow-y-auto md:block">
        <table className="w-full border-collapse" aria-label={ariaLabel}>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-hover">
              {selectable && (
                <th className="w-8 px-3 py-1 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSel}
                    onChange={() => table.toggleAllRowsSelected()}
                    aria-label="Select all visible"
                    className="h-3.5 w-3.5 accent-teal"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.id}
                  aria-sort={
                    sort?.key === c.id
                      ? sort.dir === 1
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cn(c.hideBelow ? HIDE_CLASS[c.hideBelow] : undefined)}
                >
                  <div
                    className={cn(
                      headerCls,
                      c.widthClass,
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center"
                    )}
                    onClick={() => toggleSortKey(c.id)}
                    role={c.enableSorting ?? true ? "button" : undefined}
                    tabIndex={c.enableSorting ?? true ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSortKey(c.id);
                      }
                    }}
                    aria-label={`Sort by ${c.header}`}
                  >
                    {c.header}
                    {arrowFor(c.id)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-hover/60" aria-hidden="true">
                  {selectable && (
                    <td className="px-3 py-3">
                      <div className="h-3.5 w-3.5 animate-pulse rounded-sm bg-raised" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn("px-3 py-3", c.hideBelow ? HIDE_CLASS[c.hideBelow] : undefined)}
                    >
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-raised" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              orderedRows.map((r) => {
                const id = r.id;
                const row = r.original as T;
                const isSel = sel.has(id);
                const isActive = activeId === id;
                return (
                  <tr
                    key={id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(id, el);
                      else rowRefs.current.delete(id);
                    }}
                    onClick={() => {
                      setActiveId(id);
                      onOpen?.(id);
                    }}
                    aria-selected={isSel}
                    className={cn(
                      "cursor-pointer border-b border-hover/60 text-[13px] text-ink transition-colors hover:bg-raised/60",
                      isSel && "bg-teal/10",
                      isActive && "outline outline-1 -outline-offset-1 outline-teal"
                    )}
                  >
                    {selectable && (
                      <td className={cn("px-3", cellPad)} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectRow(id, e.shiftKey);
                          }}
                          onChange={() => undefined}
                          aria-label={`Select row ${id}`}
                          className="h-3.5 w-3.5 accent-teal"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          "px-3",
                          cellPad,
                          c.widthClass,
                          c.hideBelow ? HIDE_CLASS[c.hideBelow] : undefined,
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center"
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
        {!loading && orderedRows.length === 0 && (
          <div className="py-14 text-center text-xs text-faint">{empty ?? "Nothing here yet."}</div>
        )}
      </div>

      {/* Mobile cards (<768px) */}
      <div className="min-h-0 flex-1 overflow-y-auto md:hidden">
        {loading &&
          Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
            <div key={`msk-${i}`} className="border-b border-hover/60 px-3 py-3" aria-hidden="true">
              <div className="h-4 w-2/3 animate-pulse rounded bg-raised" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-raised" />
            </div>
          ))}
        {!loading && orderedRows.length === 0 && (
          <div className="py-14 text-center text-xs text-faint">{empty ?? "Nothing here yet."}</div>
        )}
        {!loading &&
          orderedRows.map((r) => {
            const id = r.id;
            const row = r.original as T;
            const isSel = sel.has(id);
            const isActive = activeId === id;
            const ctx = {
              selected: isSel,
              active: isActive,
              onSelect: (e: React.MouseEvent) => {
                e.stopPropagation();
                selectRow(id, e.shiftKey);
              },
              onOpen: () => {
                setActiveId(id);
                onOpen?.(id);
              },
            };
            return (
              <div
                key={id}
                ref={(el) => {
                  if (el) rowRefs.current.set(id, el);
                  else rowRefs.current.delete(id);
                }}
                aria-selected={isSel}
                className={cn(
                  "border-b border-hover/60",
                  isSel && "bg-teal/10",
                  isActive && "outline outline-1 -outline-offset-1 outline-teal"
                )}
              >
                {renderMobileCard ? (
                  renderMobileCard(row, ctx)
                ) : (
                  <button
                    onClick={ctx.onOpen}
                    className="block w-full px-3 py-3 text-left"
                    style={{ minHeight: 44 }}
                  >
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {columns[0] ? columns[0].cell(row) : id}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {/* Server pager */}
      {pagination && !loading && (
        <div className="flex shrink-0 items-center justify-between border-t border-hover px-3 py-2 text-[12px] text-muted">
          <span>
            {pagination.total === 0
              ? "0 rows"
              : `${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                  (pagination.pageIndex + 1) * pagination.pageSize,
                  pagination.total
                )} of ${pagination.total}`}
          </span>
          <span className="flex items-center gap-2">
            <button
              disabled={pagination.pageIndex === 0}
              onClick={() =>
                pagination.onChange({
                  pageIndex: pagination.pageIndex - 1,
                  pageSize: pagination.pageSize,
                })
              }
              className="rounded-md border border-hover px-2.5 py-1 text-ink hover:bg-hover disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={(pagination.pageIndex + 1) * pagination.pageSize >= pagination.total}
              onClick={() =>
                pagination.onChange({
                  pageIndex: pagination.pageIndex + 1,
                  pageSize: pagination.pageSize,
                })
              }
              className="rounded-md border border-hover px-2.5 py-1 text-ink hover:bg-hover disabled:opacity-40"
            >
              Next
            </button>
          </span>
        </div>
      )}

      {/* Batch action bar */}
      {selectable && sel.size > 0 && bulkBar}
    </div>
  );
}
