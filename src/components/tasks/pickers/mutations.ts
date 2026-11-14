/**
 * Task field mutations used by the inline pickers. They only CALL existing
 * routes (PATCH /api/tasks/[id], POST /api/tasks/bulk) and report a result;
 * optimistic state + rollback live in useOptimisticTasks.
 */
export interface MutationResult {
  ok: boolean;
  error?: string;
}

async function send(url: string, method: "PATCH" | "POST", body: unknown): Promise<{ res: Response | null; data: any }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch {
    return { res: null, data: null };
  }
}

async function patchTask(id: string, body: Record<string, unknown>): Promise<MutationResult> {
  const { res, data } = await send(`/api/tasks/${id}`, "PATCH", body);
  if (!res) return { ok: false, error: "Network error: change not saved" };
  if (!res.ok || data?.ok === false) return { ok: false, error: data?.error ?? `Update failed (${res.status})` };
  return { ok: true };
}

export const saveStatus = (id: string, status: string, reason?: string | null) =>
  patchTask(id, { action: "status", status, reason: reason ?? null });

export const savePriority = (id: string, priority: string) => patchTask(id, { action: "edit", priority });

/** iso = YYYY-MM-DD, or null to clear. */
export const saveDue = (id: string, iso: string | null) => patchTask(id, { action: "edit", dueDate: iso });

export const saveTitle = (id: string, title: string) => patchTask(id, { action: "edit", title });

export const saveDescription = (id: string, description: string | null) =>
  patchTask(id, { action: "edit", description });

/** Reassign the primary assignee (same route the list's bulk bar uses). */
export async function saveAssignee(id: string, employeeId: string): Promise<MutationResult> {
  const { res, data } = await send("/api/tasks/bulk", "POST", { ids: [id], action: "reassign", value: employeeId });
  if (!res) return { ok: false, error: "Network error: change not saved" };
  if (!res.ok || data?.ok === false) return { ok: false, error: data?.error ?? `Update failed (${res.status})` };
  if (!data?.changed) {
    const err = (data?.results ?? []).find((r: { ok: boolean; error?: string }) => !r.ok)?.error;
    return { ok: false, error: err ?? "Could not reassign this task" };
  }
  return { ok: true };
}
