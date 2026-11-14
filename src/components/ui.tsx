import { cn } from "@/lib/cn";
import { initials, avatarDataUri } from "@/lib/utils";

/* ---- Linear-Grade Design System Atoms ---- */

// Shared input style token
export const inputCls =
  "h-8 w-full rounded-md border border-edge bg-transparent px-2.5 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-teal focus:outline-none";

export function Card({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-edge bg-surface",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-edge bg-raised px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted">
      {children}
    </kbd>
  );
}

const BADGE_TOKENS: Record<string, string> = {
  P0: "crimson", P1: "amber", P2: "teal", P3: "muted",
  TODO: "muted", IN_PROGRESS: "tealhi", IN_REVIEW: "amber", BLOCKED: "crimson", DONE: "emerald",
  todo: "muted", inprogress: "tealhi", inreview: "amber", blocked: "crimson", done: "emerald",
  info: "tealhi", success: "emerald", warning: "amber", danger: "crimson",
};

export function Badge({ text, kind }: { text: string; kind?: string }) {
  const raw = text.replace(/\s+/g, "").toLowerCase();
  const token = BADGE_TOKENS[text] ?? BADGE_TOKENS[raw] ?? BADGE_TOKENS[kind ?? ""] ?? "muted";
  const v = `var(--${token})`;
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: v, background: `color-mix(in srgb, ${v} 10%, transparent)` }}
    >
      {text}
    </span>
  );
}

export function Avatar({ name, size = 24, muted }: { name: string | null | undefined; size?: number; muted?: boolean }) {
  const src = avatarDataUri(name ?? "?");
  return (
    <img
      src={src}
      alt={name ?? "avatar"}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full ring-1 ring-edge", muted && "opacity-40")}
      style={{ borderRadius: "50%" }}
    />
  );
}

export function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", pulse && "animate-pulse")}
      style={{ background: color }}
    />
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[12px] font-medium text-muted", className)}>{children}</div>;
}

export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 text-[17px] font-medium tnum" style={{ color: accent ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

export function Bar({ pct, color = "var(--teal)" }: { pct: number; color?: string }) {
  return (
    <div className="mt-1.5 h-[2.5px] w-full overflow-hidden rounded-full bg-hover">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-[13px] text-muted">{title}</div>
      {hint && <p className="mt-1.5 max-w-xs text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

/** Linear-Style Action Button */
export function Btn({
  children,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  type = "button",
  onClick,
  className,
}: {
  children?: React.ReactNode;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 select-none";
  const sizes = {
    sm: "h-7 px-2.5",
    md: "h-8 px-3",
  };
  const variants = {
    primary: "bg-teal text-white hover:bg-tealhi",
    ghost:   "border border-edge bg-raised text-ink hover:bg-hover",
    subtle:  "bg-transparent text-muted hover:bg-hover hover:text-ink",
    danger:  "bg-transparent text-crimson hover:bg-crimson/10",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, sizes[size], variants[variant], className)}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---- TaskBoard 3 shell atoms (Lane A) ---- */

export interface PillTab {
  id: string;
  label: string;
  count?: number;
  /** When set the tab renders as a link instead of a button. */
  href?: string;
}

/** Fully rounded filter/view tabs; the active one is filled. */
export function PillTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: PillTab[];
  value: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 overflow-x-auto scrollbar-none", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        const cls = cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
          active
            ? "border-edge bg-hover text-ink"
            : "border-transparent text-muted hover:bg-raised hover:text-ink"
        );
        const inner = (
          <>
            {t.label}
            {t.count != null && <span className="tnum text-[12px] text-muted">{t.count}</span>}
          </>
        );
        return t.href ? (
          <a key={t.id} href={t.href} role="tab" aria-selected={active} className={cls}>
            {inner}
          </a>
        ) : (
          <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => onChange?.(t.id)} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Square, borderless 32px icon button (filters, display options, etc). */
export function GhostIconButton({
  label,
  active,
  className,
  children,
  ...rest
}: Omit<React.ComponentProps<"button">, "aria-label"> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Thin 48px page header: title left, optional pill tabs, actions right, hairline below. */
export function PageHeader({
  title,
  tabs,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Usually a <PillTabs/>. */
  tabs?: React.ReactNode;
  /** Usually <GhostIconButton/>s. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-3 border-b border-line px-4", className)}>
      <h1 className="min-w-0 truncate text-[14px] font-semibold tracking-tight text-ink">{title}</h1>
      {tabs && <div className="min-w-0 flex-1 overflow-x-auto">{tabs}</div>}
      {!tabs && <div className="flex-1" />}
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </div>
  );
}
