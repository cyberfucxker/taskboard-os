/** Task work-type categories (matches Prisma TaskCategory). */
export type TaskCategory =
  | "CALL" | "MEETING" | "SCREENING" | "BUG_FIX"
  | "DEVELOPMENT" | "DESIGN" | "CRM" | "ADMIN" | "DOCUMENTATION" | "OTHER";

export interface SubtaskView {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  status?: string;
}

export interface ActivityFeedItem {
  type: string;
  actor: string | null;
  at: string;
  payload: Record<string, unknown> | unknown;
}

export interface TaskView {
  id: string;
  code: string;
  title: string;
  description: string | null;
  descriptionBy: string | null;
  descriptionByName: string | null;
  creatorId: string | null;
  creatorName: string | null;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
  category: TaskCategory | "OTHER";
  priority: "P0" | "P1" | "P2" | "P3";
  blocked: boolean;
  blockerReason?: string | null;
  reworkReason?: string | null;
  reworkFromStage?: string | null;
  gainLever: string | null;
  outcome: string | null;
  dueDate: string | null;
  dueLabel: string | null;
  assigneeId: string | null;
  assignee: string | null;
  assignees: { id: string; name: string }[];
  department: string | null;
  departmentColor: string | null;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  estimateHrs: number | null;
  actualHrs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMs: number | null;
  work: { assigneeId: string; name: string | null; elapsedMs: number }[];
  subtasks: SubtaskView[];
}
