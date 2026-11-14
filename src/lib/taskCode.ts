/**
 * Task short codes — the ONE place that knows what a task code looks like.
 *
 * A task code is exactly 3 characters from TASK_CODE_ALPHABET (uppercase letters
 * and digits, without the look-alikes 0 O 1 I L). Old "TSK-123" style codes live
 * on in Task.legacyCode and keep working as aliases for lookups.
 *
 * Pure module (no Node or Prisma runtime imports) so client components can use it.
 */
import type { Prisma } from "@prisma/client";

export const TASK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TASK_CODE_LENGTH = 3;
export const TASK_CODE_MAX_ATTEMPTS = 50;

/** Strict shape check used for validation (after trim + uppercase). */
const TASK_CODE_RE = /^[A-Z0-9]{3}$/;

/**
 * Pattern source for finding a code inside free text (notification bell, etc.).
 * Bare 3-char tokens are far too ambiguous in prose ("the", "123"), so in text a
 * new code must be wrapped in brackets: [ABC]. Legacy TSK-123 is matched bare.
 */
export const TASK_CODE_TEXT_SOURCE = "\\[[A-Za-z0-9]{3}\\]|TSK-\\d+";

/** Uppercase, trim, strip a leading '#'. Does not validate. */
export function normalizeTaskCode(input: string): string {
  return String(input ?? "")
    .trim()
    .replace(/^#/, "")
    .trim()
    .toUpperCase();
}

/** True when the input (after trim + uppercase) is exactly 3 alphanumerics. */
export function isTaskCode(input: string): boolean {
  return TASK_CODE_RE.test(String(input ?? "").trim().toUpperCase());
}

/**
 * Find the first task code mentioned in free text.
 * Prefers a bracketed new code [ABC]; falls back to a legacy TSK-123.
 * Returns the normalized code (brackets stripped) or null.
 */
export function extractTaskCodeFromText(text: string): string | null {
  const src = String(text ?? "");
  const bracket = /\[([A-Za-z0-9]{3})\]/.exec(src);
  if (bracket) return bracket[1].toUpperCase();
  const legacy = /TSK-\d+/i.exec(src);
  if (legacy) return legacy[0].toUpperCase();
  return null;
}

function defaultRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 4294967296; // [0, 1)
}

/** One random candidate code. `random` must return a number in [0, 1). */
export function randomTaskCode(random: () => number = defaultRandom): string {
  let out = "";
  for (let i = 0; i < TASK_CODE_LENGTH; i++) {
    out += TASK_CODE_ALPHABET[Math.floor(random() * TASK_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Generate a code that `existsFn` says is free. Tries up to `maxAttempts`
 * random candidates, then throws a clear error.
 */
export async function generateTaskCode(
  existsFn: (code: string) => boolean | Promise<boolean>,
  opts: { random?: () => number; maxAttempts?: number } = {}
): Promise<string> {
  const max = opts.maxAttempts ?? TASK_CODE_MAX_ATTEMPTS;
  for (let attempt = 0; attempt < max; attempt++) {
    const candidate = randomTaskCode(opts.random);
    if (!(await existsFn(candidate))) return candidate;
  }
  throw new Error(
    `Could not generate a unique task code after ${max} attempts. The 3-character code space may be nearly full.`
  );
}

/**
 * Prisma `OR` clauses that find a task by id, new code, or legacy code alias
 * (case-insensitive on the alias). Use as: where: { OR: taskLookupClauses(x) }.
 */
export function taskLookupClauses(idOrCode: string): Prisma.TaskWhereInput[] {
  const raw = String(idOrCode ?? "").trim();
  const norm = normalizeTaskCode(raw);
  return [
    { id: raw },
    { code: norm },
    { legacyCode: { equals: norm, mode: "insensitive" } },
  ];
}
