import type { DeptWidget } from "../../types";
import { asComponent } from "../lane-d-kit";
import { AttendanceLeave, HiringPipeline, HrStats, LmsCompletion, OnboardingTasks } from "./components";

/** HR: "Who needs HR today?" People data is gated on hrms.view inside the metrics. */
export const widgets: DeptWidget[] = [
  { id: "hr-stats", title: "Summary", span: 2, Component: asComponent(HrStats) },
  { id: "hr-attendance", title: "Attendance and leave today", span: 2, Component: asComponent(AttendanceLeave) },
  { id: "hr-hiring", title: "Hiring pipeline", Component: asComponent(HiringPipeline) },
  { id: "hr-onboarding", title: "Onboarding", Component: asComponent(OnboardingTasks) },
  { id: "hr-lms", title: "Training completion", span: 2, Component: asComponent(LmsCompletion) },
];

export default widgets;
