import type { DeptWidget } from "../../types";
import { GenericStats, OverdueList, PersonLoadWidget, TasksByStatus, asComponent } from "../shared";

/** Fallback for any department without its own widget set. */
export const genericWidgets: DeptWidget[] = [
  { id: "generic-stats", title: "Summary", span: 2, Component: asComponent(GenericStats) },
  { id: "generic-status", title: "Tasks by status", Component: asComponent(TasksByStatus) },
  { id: "generic-overdue", title: "Overdue", Component: asComponent(OverdueList) },
  { id: "generic-load", title: "Load per person", span: 2, Component: asComponent(PersonLoadWidget) },
];
