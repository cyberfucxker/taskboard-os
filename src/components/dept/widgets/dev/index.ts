import type { DeptWidget } from "../../types";
import { BlockedList, DevStats, HoursVsEstimate, PersonLoadWidget, ReviewQueue, TasksByStatus, asComponent } from "../shared";

export const devWidgets: DeptWidget[] = [
  { id: "dev-stats", title: "Summary", span: 2, Component: asComponent(DevStats) },
  { id: "dev-status", title: "Tasks by status", Component: asComponent(TasksByStatus) },
  { id: "dev-blocked", title: "Blocked", Component: asComponent(BlockedList) },
  { id: "dev-review", title: "Needs review", Component: asComponent(ReviewQueue) },
  { id: "dev-load", title: "Load per person", Component: asComponent(PersonLoadWidget) },
  { id: "dev-hours", title: "Hours vs estimate", span: 2, Component: asComponent(HoursVsEstimate) },
];
