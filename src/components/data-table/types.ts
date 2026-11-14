import type { ReactNode } from "react";

export type SortDir = 1 | -1;

/** Public sort state — deliberately small, serialisable, URL-friendly. */
export interface SortState {
  key: string;
  dir: SortDir;
}

export type HideBelow = "sm" | "md" | "lg" | "xl";

/** One column definition: header, client-sort accessor, cell renderer. */
export interface DataColumn<T> {
  /** Stable id — also the sort key and TanStack column id. */
  id: string;
  /** Header label. */
  header: string;
  /** Client-side sort value. Return ranks (numbers) for custom orders. */
  accessor: (row: T) => string | number;
  /** Full custom comparator (overrides accessor sort). */
  sortFn?: (a: T, b: T) => number;
  /** First click sorts descending (e.g. dates, elapsed). Default ascending. */
  sortDescFirst?: boolean;
  /** Default true. */
  enableSorting?: boolean;
  /** Layout width, e.g. "w-[110px]". Data cells stretch by default. */
  widthClass?: string;
  /** Hide this column below a breakpoint (desktop table only). */
  hideBelow?: HideBelow;
  align?: "left" | "center" | "right";
  /** Desktop cell content. */
  cell: (row: T) => ReactNode;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

/**
 * Server-driven pagination contract. The parent owns the slice (fetches it),
 * DataTable renders the pager and reports page changes. Client-side lists
 * simply omit this prop and pass all rows.
 */
export interface ServerPagination extends PaginationState {
  total: number;
  onChange: (p: PaginationState) => void;
}
