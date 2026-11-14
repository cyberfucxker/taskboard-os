import type { Currency } from "@prisma/client";

/** Legacy view strings from the design (₹4.82M etc.) applied to numeric values. */
const RU = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Format a Decimal money value (in rupees major units) for display. */
export function fmtMoney(value: number | string | null | undefined, currency: Currency = "INR"): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "—";
  return currency === "USD" ? USD.format(n) : RU.format(n);
}

/** Compact Indian/lakh style: 628000 -> "₹6.28L", 4820000 -> "₹48.2L". */
export function fmtCompact(value: number | string | null | undefined, currency: Currency = "INR"): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "—";
  const prefix = currency === "USD" ? "$" : "₹";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${prefix}${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${prefix}${(n / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${prefix}${(n / 1000).toFixed(1)}k`;
  return `${prefix}${n}`;
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Relative "4m ago" style timestamps — keep the design's terse cadence. */
export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** RFC-safe URL-safe SVG data for a generic avatar (avoids external assets). */
export function avatarDataUri(name: string, from = "#3E8B93", to = "#A78BFA"): string {
  const text = initials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="40" height="40" rx="8" fill="url(#g)"/><text x="20" y="25" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#0D1117" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
