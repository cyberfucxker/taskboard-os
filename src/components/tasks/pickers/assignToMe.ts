/**
 * Pure rules for the "Assign to me" action. The action itself reuses the
 * existing reassign mechanism (saveAssignee -> POST /api/tasks/bulk), which lets
 * leads reassign anything and everyone else only take tasks they created or are
 * already on, so the button is offered under the same conditions.
 */
export interface TakeableTask {
  status: string;
  assigneeId: string | null;
  assignees: { id: string; name: string }[];
  creatorId: string | null;
  archived?: boolean;
  deletedAt?: string | null;
}

export function canAssignToMe(task: TakeableTask, me: string | undefined | null, canAssign: boolean): boolean {
  if (!me) return false;
  if (task.status === "DONE" || task.archived || task.deletedAt) return false;
  if (task.assigneeId === me || task.assignees.some((a) => a.id === me)) return false;
  return canAssign || task.creatorId === me;
}

/** Optimistic field patch: me becomes the primary assignee, others stay on the task. */
export function assignToMePatch(task: Pick<TakeableTask, "assignees">, me: { id: string; name: string }) {
  return {
    assigneeId: me.id,
    assignee: me.name,
    assignees: [{ id: me.id, name: me.name }, ...task.assignees.filter((a) => a.id !== me.id)],
  };
}

/** New-task form: put me first in the assignee list without duplicating. */
export function addMeToAssignees(ids: string[], me: string): string[] {
  return ids.includes(me) ? ids : [me, ...ids];
}
