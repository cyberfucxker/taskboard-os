import React from "react";
import { Circle, Clock, CheckCircle2, AlertCircle, Sparkles, Check } from "lucide-react";
import type { TaskView } from "@/components/tasks/types";

export type Status = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED";
export type Priority = "P0" | "P1" | "P2" | "P3";

export const STATUS_GROUP_ORDER: Status[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
export const TASK_ORDER_KEY = "taskboard.taskOrder";

// In Phase 1 Work Order Model: BLOCKED status is excluded from standard menus
// Blocking is handled exclusively via the interactive Flag Blocker (⚑) workflow
export const STATUS_MENU_ORDER: Status[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

export const PRIORITY_MENU_ORDER: Priority[] = ["P0", "P1", "P2", "P3"];

export const STATUS_META: Record<
  Status,
  { label: string; color: string; bg: string; border: string; desc: string }
> = {
  TODO: {
    label: "To Do",
    color: "var(--muted)",
    bg: "var(--surface)",
    border: "var(--edge)",
    desc: "Not yet started",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "var(--teal)",
    bg: "rgba(62, 139, 147, 0.12)",
    border: "rgba(62, 139, 147, 0.3)",
    desc: "Actively working",
  },
  IN_REVIEW: {
    label: "In Review",
    color: "var(--purple, #a371f7)",
    bg: "rgba(163, 113, 247, 0.12)",
    border: "rgba(163, 113, 247, 0.3)",
    desc: "Pending verification",
  },
  DONE: {
    label: "Done",
    color: "var(--tealhi)",
    bg: "rgba(78, 172, 182, 0.12)",
    border: "rgba(78, 172, 182, 0.3)",
    desc: "Completed",
  },
  BLOCKED: {
    label: "Blocked",
    color: "var(--crimson)",
    bg: "rgba(248, 81, 73, 0.12)",
    border: "rgba(248, 81, 73, 0.3)",
    desc: "Flagged blocker",
  },
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; short: string; color: string; bg: string; border: string }
> = {
  P0: {
    label: "P0 · Urgent",
    short: "P0",
    color: "var(--crimson)",
    bg: "rgba(248, 81, 73, 0.12)",
    border: "rgba(248, 81, 73, 0.3)",
  },
  P1: {
    label: "P1 · High",
    short: "P1",
    color: "var(--amber)",
    bg: "rgba(210, 153, 34, 0.12)",
    border: "rgba(210, 153, 34, 0.3)",
  },
  P2: {
    label: "P2 · Normal",
    short: "P2",
    color: "var(--teal)",
    bg: "rgba(62, 139, 147, 0.12)",
    border: "rgba(62, 139, 147, 0.3)",
  },
  P3: {
    label: "P3 · Low",
    short: "P3",
    color: "var(--muted)",
    bg: "var(--surface)",
    border: "var(--edge)",
  },
};

export function StatusIcon({
  status,
  className = "h-3.5 w-3.5",
  size,
}: {
  status: Status | string;
  className?: string;
  size?: number;
}) {
  const style = size ? { width: size, height: size } : undefined;
  switch (status) {
    case "IN_PROGRESS":
      return <Clock className={`${className} text-teal animate-pulse`} style={style} />;
    case "IN_REVIEW":
    case "REVIEW":
      return <Sparkles className={`${className} text-purple`} style={style} />;
    case "DONE":
      return <CheckCircle2 className={`${className} text-tealhi`} style={style} />;
    case "BLOCKED":
      return <AlertCircle className={`${className} text-crimson`} style={style} />;
    case "TODO":
    default:
      return <Circle className={`${className} text-muted`} style={style} />;
  }
}

export function PriorityIcon({
  priority,
  className = "h-3.5 w-3.5",
  size,
}: {
  priority: Priority | string;
  className?: string;
  size?: number;
}) {
  const meta = PRIORITY_META[priority as Priority] ?? PRIORITY_META.P2;
  const style = size ? { width: size, height: size, color: meta.color } : { color: meta.color };
  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-bold text-[11px] ${className}`}
      style={style}
    >
      {meta.short}
    </span>
  );
}

export function AssigneeAvatar({
  name,
  avatarUrl,
  size = 20,
  muted,
  className = "",
}: {
  name: string | null;
  avatarUrl?: string | null;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const initials = (name ?? "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ""}
        className={`rounded-full object-cover border border-edge shrink-0 ${muted ? "opacity-40 grayscale" : ""} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-hover text-ink font-mono text-[10px] font-medium border border-edge shrink-0 select-none ${
        muted ? "opacity-40" : ""
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}

export function allowedStatuses(currentStatus: Status): Status[] {
  // In Phase 1: only non-blocked standard flow transitions in picker menus
  return STATUS_MENU_ORDER;
}

export function dueInfo(dueDateOrTask: string | null | undefined | { dueDate?: string | null }): {
  tone: "overdue" | "today" | "tomorrow" | "future" | "none";
  label: string;
  text: string;
} {
  const dueDate = typeof dueDateOrTask === "object" && dueDateOrTask !== null
    ? dueDateOrTask.dueDate
    : dueDateOrTask;

  if (!dueDate) return { tone: "none", label: "No due date", text: "No due date" };

  const target = new Date(dueDate);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const lbl = `${Math.abs(diffDays)}d overdue`;
    return { tone: "overdue", label: lbl, text: lbl };
  }
  if (diffDays === 0) {
    return { tone: "today", label: "Due Today", text: "Due Today" };
  }
  if (diffDays === 1) {
    return { tone: "tomorrow", label: "Due Tomorrow", text: "Due Tomorrow" };
  }
  const formatted = target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    tone: "future",
    label: formatted,
    text: formatted,
  };
}

export function dueLabelFor(dueDate: string | null | undefined): string {
  return dueInfo(dueDate).label;
}

export const DUE_TONE_COLOR: Record<
  "overdue" | "today" | "tomorrow" | "future" | "none",
  string
> = {
  overdue: "var(--crimson)",
  today: "var(--amber)",
  tomorrow: "var(--teal)",
  future: "var(--muted)",
  none: "var(--faint, #6e7681)",
};
