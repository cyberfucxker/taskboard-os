/**
 * Shared duration formatter — plain module (no "use client") so both server
 * components (Overview) and client components (Today/Hour ring) can use it.
 */
export function fmtMs(ms: number): string {
  const s = Math.round(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function fmtMsWithSec(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`;
  }
  return `${m.toString().padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`;
}
