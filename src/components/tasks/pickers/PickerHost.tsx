"use client";

/**
 * PickerHost — ONE shared popover for a whole task list. A list of 2,000 rows
 * would otherwise mount 8,000 popover roots; instead a row's trigger just
 * tells the host which task / kind / anchor element is active, and the host
 * renders the same menu bodies the per-trigger pickers use.
 */
import { useMemo } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { PopoverContent } from "@/components/ui/popover";
import type { TaskView } from "@/components/tasks/types";
import { AssigneeMenu, DueMenu, PICKER_CONTENT_CLS, PriorityMenu, StatusMenu } from "./menus";
import { canAssignToMe } from "./assignToMe";
import { allowedStatuses, type Priority, type Status } from "./atoms";

export type PickerKind = "status" | "priority" | "assignee" | "due";
export interface PickerState {
  kind: PickerKind;
  taskId: string;
  anchor: HTMLElement;
}

export function PickerHost({
  picker,
  task,
  employees,
  currentUserId,
  canAssign,
  onClose,
  onStatus,
  onPriority,
  onAssignee,
  onDue,
}: {
  picker: PickerState | null;
  task: TaskView | null;
  employees: { id: string; name: string }[];
  currentUserId?: string;
  canAssign: boolean;
  onClose: () => void;
  onStatus: (t: TaskView, status: Status, reason?: string) => void;
  onPriority: (t: TaskView, p: Priority) => void;
  onAssignee: (t: TaskView, e: { id: string; name: string }) => void;
  onDue: (t: TaskView, iso: string | null) => void;
}) {
  const anchorRef = useMemo(() => ({ current: picker?.anchor ?? null }), [picker?.anchor]);
  if (!picker || !task) return null;

  return (
    <PopoverPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <PopoverPrimitive.Anchor virtualRef={anchorRef} />
      <PopoverContent
        align="start"
        collisionPadding={8}
        data-picker-content=""
        className={PICKER_CONTENT_CLS}
        style={{ zIndex: 90 }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {picker.kind === "status" && (
          <StatusMenu
            value={task.status}
            allowed={allowedStatuses(task.status)}
            onSelect={(s, reason) => {
              onClose();
              if (s !== task.status) onStatus(task, s, reason);
            }}
          />
        )}
        {picker.kind === "priority" && (
          <PriorityMenu
            value={task.priority}
            onSelect={(p) => {
              onClose();
              if (p !== task.priority) onPriority(task, p);
            }}
          />
        )}
        {picker.kind === "assignee" && (
          <AssigneeMenu
            value={task.assigneeId}
            employees={employees}
            currentUserId={currentUserId}
            canAssign={canAssign}
            offerTake={canAssignToMe(task, currentUserId, canAssign)}
            onSelect={(e) => {
              onClose();
              if (e.id !== task.assigneeId) onAssignee(task, e);
            }}
          />
        )}
        {picker.kind === "due" && (
          <DueMenu
            value={task.dueDate}
            onSelect={(iso) => {
              onClose();
              if ((iso ?? null) !== (task.dueDate ? task.dueDate.slice(0, 10) : null)) onDue(task, iso);
            }}
          />
        )}
      </PopoverContent>
    </PopoverPrimitive.Root>
  );
}
