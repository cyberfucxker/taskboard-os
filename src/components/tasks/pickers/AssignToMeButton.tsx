"use client";

import { UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { canAssignToMe, type TakeableTask } from "./assignToMe";

/** Ghost "Assign to me" button; renders nothing when the task is not takeable. */
export function AssignToMeButton({
  task,
  currentUserId,
  canAssign,
  onTake,
  className,
}: {
  task: TakeableTask;
  currentUserId?: string;
  canAssign: boolean;
  onTake: () => void;
  className?: string;
}) {
  if (!canAssignToMe(task, currentUserId, canAssign)) return null;
  return (
    <button
      type="button"
      onClick={onTake}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal",
        className
      )}
    >
      <UserPlus className="h-4 w-4" aria-hidden />
      Assign to me
    </button>
  );
}
