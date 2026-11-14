import type { ComponentType } from "react";

/** Which slice of the department a widget should show. */
export type DeptScope = "mine" | "all";

/** Props every department widget receives. `departmentId` is Department.id. */
export interface DeptWidgetProps {
  departmentId: string;
  scope: DeptScope;
  userId: string;
}

/**
 * The TaskBoard 3 department-dashboard widget contract (Lane C owns, Lane D plugs in).
 * A widget is a server OR client component rendered in a 2-column grid
 * (span 2 = full width). Widgets must be READ-ONLY, must honour `scope`
 * ('mine' = only this user's rows, 'all' = whole department) and must scope every
 * query by `departmentId`.
 */
export interface DeptWidget {
  id: string;
  title: string;
  span?: 1 | 2;
  Component: ComponentType<DeptWidgetProps>;
}
