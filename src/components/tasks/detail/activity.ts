/**
 * Plain-words wording for task Activity rows (the audit trail the server
 * already writes). Used by the task page timeline and the Inbox.
 */
import { STATUS_META, type Status } from "@/components/tasks/pickers/atoms";

const statusName = (v: unknown): string => STATUS_META[String(v) as Status]?.label ?? String(v ?? "").replace(/_/g, " ").toLowerCase();

export function describeActivity(type: string, payload: unknown): string {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  switch (type) {
    case "TASK_CREATED":
      return "created this task";
    case "TASK_STARTED":
      return "started working";
    case "TASK_PAUSED":
      return `paused work${p.reason ? `: ${String(p.reason)}` : ""}`;
    case "TASK_COMPLETED":
      return "completed this task";
    case "TASK_REOPENED":
      return "reopened this task";
    case "TASK_BLOCKED":
      return `blocked this task${p.reason ? `: ${String(p.reason)}` : ""}`;
    case "TASK_UNBLOCKED":
      return "unblocked this task";
    case "TASK_REWORK":
      return `sent this back for rework${p.reason ? `: ${String(p.reason)}` : ""}`;
    case "REVIEW_REQUESTED":
      return "asked for a review";
    case "TASK_ASSIGNED":
      return "changed the assignee";
    case "TASK_STATUS_CHANGED":
      return p.from || p.to ? `moved it from ${statusName(p.from)} to ${statusName(p.to)}` : "changed the status";
    case "TASK_UPDATED": {
      if (Array.isArray(p.fields) && p.fields.length) return `edited ${(p.fields as string[]).join(", ")}`;
      if (Array.isArray(p.patch) && p.patch.length) return `edited ${(p.patch as string[]).join(", ")}`;
      if (p.deletedBy) return "deleted this task";
      return "edited this task";
    }
    case "SUBTASK_TOGGLED":
      return `marked a sub-task ${p.done ? "done" : "not done"}`;
    case "OUTCOME_RECORDED":
      return "recorded the outcome";
    default:
      return (type || "did something").toLowerCase().replace(/_/g, " ");
  }
}

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
