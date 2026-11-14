import type { DeptWidget } from "../../types";
import { DeliverablesByClient, DesignStats, PersonLoadWidget, ReviewQueue, RevisionsByClient, asComponent } from "../shared";

export const designWidgets: DeptWidget[] = [
  { id: "design-stats", title: "Summary", span: 2, Component: asComponent(DesignStats) },
  { id: "design-review", title: "Needs review", Component: asComponent(ReviewQueue) },
  { id: "design-deliverables", title: "Deliverables by client", Component: asComponent(DeliverablesByClient) },
  { id: "design-revisions", title: "Revisions by client", Component: asComponent(RevisionsByClient) },
  { id: "design-load", title: "Load per person", Component: asComponent(PersonLoadWidget) },
];
