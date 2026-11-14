import type { DeptWidget } from "../../types";
import { DeliverablesByClient, DmStats, DueThisWeek, MetaLeadsWidget, OverdueByClient, asComponent } from "../shared";

export const dmWidgets: DeptWidget[] = [
  { id: "dm-stats", title: "Summary", span: 2, Component: asComponent(DmStats) },
  { id: "dm-deliverables", title: "Deliverables by client", Component: asComponent(DeliverablesByClient) },
  { id: "dm-due", title: "Due this week", Component: asComponent(DueThisWeek) },
  { id: "dm-overdue", title: "Overdue by client", Component: asComponent(OverdueByClient) },
  { id: "dm-meta", title: "Meta leads by campaign", Component: asComponent(MetaLeadsWidget) },
];
