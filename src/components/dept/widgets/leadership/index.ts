import type { DeptWidget } from "../../types";
import { asComponent } from "../lane-d-kit";
import { ClientsAtRisk, DepartmentRollup, IdleToday, LeadershipStats } from "./components";

/** Leadership: "Where is the company hurting?" Audience-gated inside the metrics (heads and leadership only). */
export const widgets: DeptWidget[] = [
  { id: "leadership-stats", title: "Summary", span: 2, Component: asComponent(LeadershipStats) },
  { id: "leadership-departments", title: "Departments", span: 2, Component: asComponent(DepartmentRollup) },
  { id: "leadership-clients", title: "Clients at risk", Component: asComponent(ClientsAtRisk) },
  { id: "leadership-idle", title: "Idle today", Component: asComponent(IdleToday) },
];

export default widgets;
