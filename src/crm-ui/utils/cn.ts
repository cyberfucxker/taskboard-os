/**
 * Tiny clsx-compatible class joiner (TaskBoard does not ship clsx). Accepts strings, numbers,
 * falsy values, arrays and `{ className: condition }` objects, like clsx does.
 */
export type ClassValue = ClassArray | ClassDictionary | string | number | bigint | null | boolean | undefined;
export type ClassDictionary = Record<string, unknown>;
export type ClassArray = ClassValue[];

function toVal(mix: ClassValue): string {
  if (!mix) return '';
  if (typeof mix === 'string') return mix;
  if (typeof mix === 'number' || typeof mix === 'bigint') return String(mix);
  if (Array.isArray(mix)) return mix.map(toVal).filter(Boolean).join(' ');
  if (typeof mix === 'object') {
    return Object.keys(mix)
      .filter((key) => (mix as ClassDictionary)[key])
      .join(' ');
  }
  return '';
}

export function cn(...inputs: ClassValue[]): string {
  return inputs.map(toVal).filter(Boolean).join(' ');
}
