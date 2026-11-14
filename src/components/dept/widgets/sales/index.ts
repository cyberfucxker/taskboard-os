import type { DeptWidget } from "../../types";
import { asComponent } from "../lane-d-kit";
import {
  FollowUpsDue, PipelineStages, RepConversion, SalesStats, SourceQuality, UntouchedLeads,
} from "./components";

/** Sales: "Who do I call now?" CRM data only; every list links into the CRM. */
export const widgets: DeptWidget[] = [
  { id: "sales-stats", title: "Summary", span: 2, Component: asComponent(SalesStats) },
  { id: "sales-followups", title: "Follow-ups due today", Component: asComponent(FollowUpsDue) },
  { id: "sales-untouched", title: "Leads untouched for 24h+", Component: asComponent(UntouchedLeads) },
  { id: "sales-pipeline", title: "Pipeline by stage", Component: asComponent(PipelineStages) },
  { id: "sales-reps", title: "Conversion by rep", Component: asComponent(RepConversion) },
  { id: "sales-sources", title: "Lead source quality", span: 2, Component: asComponent(SourceQuality) },
];

export default widgets;
