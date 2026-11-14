"use client";

import { useEffect, useState } from "react";
import { effectiveCaps, ROLE_ORDER, type AccessOverrides, type Capability } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { Avatar, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { ALL_PAGES, pageImplies, type PageSlug } from "@/lib/pages";
import { EntityLink } from "@/components/entity/EntityLink";
import { ListToolbar, NoMatches, StickyList, useListFilter } from "@/components/list";

export interface AccessEmployeeRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: Role;
  status: string;
  deptSlug: string | null;
  deptName: string | null;
  pages: PageSlug[];
  allow: Capability[];
  deny: Capability[];
}

interface Props {
  rows: AccessEmployeeRow[];
  baseCapsByRole: Record<Role, readonly Capability[]>;
  deptAddons: Record<string, Capability[]>;
  roleLabels: Record<Role, string>;
  groups: { label: string; caps: Capability[] }[];
}

/**
 * Access manager — the COO's per-employee control surface. Each row shows the
 * employee's name, role (editable), department, and every capability as a
 * chip. Chips have three states, derived from the effective set:
 *   ON    (base ⊕ dept ⊕ override.allow, not denied)   → show as granted
 *   OFF   (not granted)                                 → click to ALLOW
 *   DENIED (base/dept granted but override.deny active) → click to un-deny
 * A chip the role has by default and we want to REMOVE → click turns the
 * appropriate deny add-on member of `deny`. Click behaviour keeps the stored
 * overrides minimal (only the deltas are written).
 */
export function AccessManager({ rows, baseCapsByRole, deptAddons, roleLabels, groups }: Props) {
  const toast = useToast();
  const [state, setState] = useState<AccessEmployeeRow[]>(rows);
  // Realtime: fresh server props replace the local copy.
  useEffect(() => { setState(rows); }, [rows]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const capsFor = (row: AccessEmployeeRow) =>
    effectiveCaps(row.role, row.deptSlug, { allow: row.allow, deny: row.deny } as AccessOverrides);

  function isGranted(row: AccessEmployeeRow, cap: Capability) {
    return capsFor(row).has(cap);
  }
  function isDenied(row: AccessEmployeeRow, cap: Capability) {
    return row.deny.includes(cap);
  }

  function toggleCap(id: string, cap: Capability) {
    setState((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        // If it's currently granted, revoke (both allow-granted-by-override and
        // base/dept granted are removed the same way: add to deny, drop from allow).
        if (isGranted(row, cap)) {
          if (row.allow.includes(cap)) return { ...row, allow: row.allow.filter((c) => c !== cap) };
          return { ...row, deny: [...row.deny, cap] };
        }
        // Otherwise grant explicitly (drop any deny).
        return { ...row, allow: [...row.allow, cap], deny: row.deny.filter((c) => c !== cap) };
      })
    );
    setDirty((prev) => new Set(prev).add(id));
  }

  function changeRole(id: string, role: Role) {
    setState((prev) => prev.map((r) => (r.id === id ? { ...r, role } : r)));
    setDirty((prev) => new Set(prev).add(id));
  }

  function togglePage(id: string, page: PageSlug) {
    setState((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const on = row.pages.includes(page);
        return { ...row, pages: on ? row.pages.filter((p) => p !== page) : [...row.pages, page] };
      })
    );
    setDirty((prev) => new Set(prev).add(id));
  }

  async function save() {
    const targets = state.filter((r) => dirty.has(r.id));
    if (!dirty.size) { toast("No changes to save"); return; }
    setBusy("all");
    try {
      for (const t of targets) {
        const res = await fetch(`/api/access/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: t.role,
            pages: t.pages,
            allow: t.allow,
            deny: t.deny,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: res.statusText }));
          toast(j.error ?? "Save failed", "error");
          return;
        }
      }
      setDirty(new Set());
      toast("Access saved — applies on their next request", "success");
    } catch {
      toast("Could not reach the server", "error");
    } finally {
      setBusy(null);
    }
  }

  const [openId, setOpenId] = useState<string | null>(null);
  const af = useListFilter(state, (r) => [r.name, r.email, r.title, r.deptName, roleLabels[r.role] ?? r.role, r.status].filter(Boolean).join(" "));

  return (
    <StickyList
      header={
        <div className="flex h-12 items-center justify-between gap-3 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-[14px] font-semibold tracking-tight text-ink">Access</h1>
            <span className="hidden truncate text-[12px] text-muted md:block">who sees what · per employee</span>
          </div>
          <button
            onClick={save}
            disabled={busy !== null || dirty.size === 0}
            className="h-8 rounded-md bg-teal px-3 text-[13px] font-medium text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : dirty.size ? `Save ${dirty.size} change${dirty.size > 1 ? "s" : ""}` : "Saved"}
          </button>
        </div>
      }
      toolbar={<ListToolbar filter={af} noun="people" placeholder="Filter people by name, role, department…" />}
    >
    <div className="mx-auto max-w-[1200px] space-y-4 p-5">
      {af.active && af.filtered.length === 0 && <NoMatches filter={af} />}
      <Card className="divide-y divide-hover">
        {af.filtered.map((row) => (
          <AccessRow
            key={row.id}
            row={row}
            open={openId === row.id}
            onToggleOpen={() => setOpenId((o) => (o === row.id ? null : row.id))}
            groups={groups}
            baseCapsByRole={baseCapsByRole}
            deptAddons={deptAddons}
            roleLabels={roleLabels}
            isGranted={(c) => isGranted(row, c)}
            isDenied={(c) => isDenied(row, c)}
            onToggle={(c) => toggleCap(row.id, c)}
            onChangeRole={(r) => changeRole(row.id, r)}
            pages={row.pages}
            onTogglePage={(p) => togglePage(row.id, p)}
          />
        ))}
        {state.length === 0 && (
          <div className="p-6 text-[13px] text-muted">No employees found.</div>
        )}
      </Card>
    </div>
    </StickyList>
  );
}

function AccessRow({
  row, open, onToggleOpen, groups, baseCapsByRole, deptAddons, roleLabels,
  isGranted, isDenied, onToggle, onChangeRole, pages, onTogglePage,
}: {
  row: AccessEmployeeRow;
  open: boolean;
  onToggleOpen: () => void;
  groups: Props["groups"];
  baseCapsByRole: Record<Role, readonly Capability[]>;
  deptAddons: Record<string, Capability[]>;
  roleLabels: Record<Role, string>;
  isGranted: (c: Capability) => boolean;
  isDenied: (c: Capability) => boolean;
  onToggle: (c: Capability) => void;
  onChangeRole: (r: Role) => void;
  pages: PageSlug[];
  onTogglePage: (p: PageSlug) => void;
}) {
  const pageImpliesMissing = (ps: PageSlug[], granted: (c: Capability) => boolean) =>
    ps.filter((p) => !pageImplies(p).every((c) => granted(c)));

  const isActive = row.status === "ACTIVE";
  return (
    <div>
      <button onClick={onToggleOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-raised">
        <Avatar name={row.name} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span onClick={(e) => e.stopPropagation()} className="truncate">
              <EntityLink entity={{ type: "person", id: row.id, name: row.name }} className="text-[13px] font-medium" />
            </span>
            {!isActive && <span className="font-mono text-[10px] text-muted">{row.status}</span>}
          </div>
          <div className="truncate font-mono text-[11px] text-muted">
            {row.title ?? ""} · {row.deptName ?? "—"} · {row.email}
          </div>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          {pages.length > 0 && <span className="font-mono text-[10px] text-tealhi">{pages.length} pages</span>}
          {pageImpliesMissing(pages, isGranted).length > 0 && (
            <span className="font-mono text-[10px] text-amber">!commercial</span>
          )}
          {row.deny.length > 0 && <span className="font-mono text-[10px] text-crimson">{row.deny.length} denied</span>}
          {row.allow.length > 0 && <span className="font-mono text-[10px] text-emerald">+{row.allow.length}</span>}
        </div>
        <select
          value={row.role}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChangeRole(e.target.value as Role)}
          className="rounded-md border border-hover bg-raised px-2 py-1 text-[12px] text-ink"
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>{roleLabels[r]}</option>
          ))}
        </select>
        <span className={cn("font-mono text-[11px]", open ? "text-tealhi" : "text-muted")}>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-hover bg-bg px-4 pb-4 pt-3">
          {/* Pages — the primary surface: what the employee sees in the sidebar */}
          <div className="mb-4">
            <div className="label mb-1.5">Pages visible in sidebar</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {ALL_PAGES.map((p) => {
                const on = pages.includes(p);
                const implies = pageImplies(p);
                return (
                  <button
                    key={p}
                    onClick={() => onTogglePage(p)}
                    title={implies.length ? `Requires: ${implies.join(", ")}` : p}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-left text-[12px] transition",
                      on
                        ? "border-teal/40 bg-teal/15 text-tealhi"
                        : "border-hover bg-raised text-muted hover:border-teal/30 hover:text-ink"
                    )}
                  >
                    {on ? "✓ " : ""}{p}
                  </button>
                );
              })}
            </div>
            {pageImpliesMissing(pages, isGranted).length > 0 && (
              <p className="mt-1.5 font-mono text-[11px] text-amber">
                ⚠ Blocked at runtime — missing: {pageImpliesMissing(pages, isGranted).map((p) => pageImplies(p).join(", ")).join(", ")}
              </p>
            )}
          </div>

          {/* Advanced: capability chips (actions / overrides) */}
          <div className="label mb-1.5">Action overrides (advanced)</div>
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="label mb-1.5">{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.caps.map((c) => {
                  const granted = isGranted(c);
                  const denied = isDenied(c);
                  return (
                    <button
                      key={c}
                      onClick={() => onToggle(c)}
                      title={c}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-[11px] transition",
                        granted
                          ? "border-teal/40 bg-teal/15 text-tealhi"
                          : denied
                          ? "border-crimson/40 bg-crimson/10 text-crimson line-through"
                          : "border-hover bg-raised text-muted hover:border-teal/40"
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted">
            {row.deptName ? `Department “${row.deptName}” adds: ${(deptAddons[row.deptSlug ?? ""] ?? []).join(", ") || "nothing extra"}.` : "No department."}{" "}
            Granted = solid · denied = struck through · grey = available but off.
          </p>
        </div>
      )}
    </div>
  );
}