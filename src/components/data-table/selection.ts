/**
 * Pure selection + keyboard-index helpers for DataTable. Kept free of React
 * so they are unit-testable (see tests/dataTable.test.ts).
 */

/** Toggle one id in a selection set (returns a new Set). */
export function toggleIdInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Ids from fromId..toId inclusive along the visible order. Empty if unknown. */
export function rangeIdsBetween(orderedIds: string[], fromId: string, toId: string): string[] {
  const a = orderedIds.indexOf(fromId);
  const b = orderedIds.indexOf(toId);
  if (a === -1 || b === -1) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(lo, hi + 1);
}

/** Union a list of ids into a selection set (returns a new Set). */
export function addRangeToSet(set: Set<string>, ids: string[]): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.add(id);
  return next;
}

/**
 * Move the keyboard-active index by delta, clamped to [0, count). Null stays
 * null when the list is empty; otherwise null + down starts at 0.
 */
export function moveActiveIndex(
  current: number | null,
  delta: number,
  count: number
): number | null {
  if (count <= 0) return null;
  if (current === null) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

/** True when the key event originates in an editable field. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof (el as HTMLElement).closest !== "function") return false;
  return Boolean(
    (el as HTMLElement).closest("input, select, textarea, [contenteditable='true'], [contenteditable='']")
  );
}
