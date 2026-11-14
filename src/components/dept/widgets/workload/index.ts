import type { DeptWidget } from "../../types";
import { asComponent } from "../shared";
import { WorkloadWidget } from "./WorkloadWidget";

/** TaskBoard 3 Lane I: one 'Workload' widget, registered for every department in registry.ts. */
export const widgets: DeptWidget[] = [
  { id: "workload", title: "Workload", span: 2, Component: asComponent(WorkloadWidget) },
];
export default widgets;
