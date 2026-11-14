/**
 * T8 — focus block, client-safe half.
 *
 * Kept apart from src/lib/focus.ts because that file imports prisma and the event log,
 * and the header chip that renders the combined timer is a client component. Nothing
 * here touches the database — it is the shape the API returns plus the maths that turns
 * the block's start time into the "01:23:45" employees read.
 */

export const MAX_BLOCK_TASKS = 3;

export interface BlockTaskView {
  id: string;
  code: string;
  title: string;
  status: string;
  /** Position in the block, 1-3 — the rank the employee chose by tapping order. */
  rank: number;
}

export interface FocusBlockView {
  id: string;
  employeeId: string;
  startedAt: string;
  activeTaskId: string;
  taskIds: string[];
  tasks: BlockTaskView[];
}

/**
 * Combined block timer in ms: wall-clock since the block started, minus a break the
 * employee is currently on. Past breaks are not reconstructable from the block row —
 * per-task truth stays in TaskWorkSession, which the 8h meter already reads.
 */
export function blockElapsedMs(
  startedAtMs: number,
  shiftPausedAtMs: number | null,
  nowMs: number
): number {
  const raw = Math.max(0, nowMs - startedAtMs);
  if (shiftPausedAtMs === null) return raw;
  return Math.max(0, raw - Math.max(0, nowMs - shiftPausedAtMs));
}

/** Combined timer as HH:MM:SS, matching the clock the rest of the header shows. */
export function focusClockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}