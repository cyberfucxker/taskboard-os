"use client";

import { useMemo, useState } from "react";
import { Building2, Plus, Save } from "lucide-react";
import { Card, Avatar, SectionLabel, Dot } from "@/components/ui";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ClientDetailDrawer, type ClientDetail } from "@/components/clients/ClientDetailDrawer";
import { EntityLink } from "@/components/entity/EntityLink";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { ListToolbar, NoMatches, StickyList, useListFilter, useListKeys, useWideScreen } from "@/components/list";

const HEALTH_COLOR: Record<string, string> = { HEALTHY: "var(--emerald)", WATCH: "var(--amber)", AT_RISK: "var(--crimson)" };
export const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "var(--emerald)", ONBOARDING: "var(--teal)", PAUSED: "var(--amber)", COMPLETED: "var(--muted)", OFFBOARDED: "var(--faint)",
};

/**
 * Clients page — every client is a clickable card that opens a linked drawer
 * (tasks + owners + projects). Searchable via the global SearchableSelect.
 */
export function ClientsView({ clients }: { clients: ClientDetail[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const wide = useWideScreen();
  const selected = clients.find((c) => c.id === selectedId) ?? null;

  const byHealth = useMemo(() => (filter === "all" ? clients : clients.filter((c) => c.health === filter)), [clients, filter]);
  const f = useListFilter(byHealth, (c) =>
    [c.name, c.industry, c.tier, c.region, c.health, ...c.owners.map((o) => o.name), ...c.projects.map((p) => p.name)].filter(Boolean).join(" ")
  );
  const filtered = f.filtered;
  const active = clients.filter((c) => c.health !== "AT_RISK").length;
  useListKeys({ ids: filtered.map((c) => c.id), activeId, onActive: setActiveId, onOpen: setSelectedId });

  return (
    <StickyList
      header={
        <div className="flex h-12 items-center gap-3 border-b border-line px-4">
          <h1 className="text-[14px] font-semibold tracking-tight text-ink">Clients</h1>
          <span className="hidden truncate text-[12px] text-muted md:block">accounts · every client links to its tasks, projects & owners</span>
        </div>
      }
      toolbar={
        <ListToolbar
          filter={f}
          noun="clients"
          placeholder="Filter clients…"
          pills={[
            { id: "all", label: "All", count: clients.length, active: filter === "all", onClick: () => setFilter("all") },
            { id: "HEALTHY", label: "Healthy", count: clients.filter((c) => c.health === "HEALTHY").length, active: filter === "HEALTHY", onClick: () => setFilter("HEALTHY") },
            { id: "WATCH", label: "Watch", count: clients.filter((c) => c.health === "WATCH").length, active: filter === "WATCH", onClick: () => setFilter("WATCH") },
            { id: "AT_RISK", label: "At risk", count: clients.filter((c) => c.health === "AT_RISK").length, active: filter === "AT_RISK", onClick: () => setFilter("AT_RISK") },
          ]}
          primary={
            <button
              onClick={() => setShowNew(true)}
              title="Create a new client"
              className="flex h-8 items-center gap-1.5 rounded-md bg-teal px-3 text-[13px] font-medium text-white hover:bg-tealhi"
            >
              <Plus className="h-4 w-4" /> New client
            </button>
          }
        />
      }
      peek={
        wide && selected ? (
          <ClientDetailDrawer
            inline
            client={selected}
            open
            onClose={() => setSelectedId(null)}
            onEditDone={() => { setSelectedId(null); window.location.reload(); }}
          />
        ) : null
      }
    >
    <div className="space-y-4 p-5">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <SectionLabel>Total clients</SectionLabel>
          <div className="mt-1.5 tnum text-[16px] font-medium text-ink">{clients.length}</div>
        </div>
        <div>
          <SectionLabel>Healthy / Active</SectionLabel>
          <div className="mt-1.5 tnum text-lg font-semibold text-emerald">{active}</div>
        </div>
        <div>
          <SectionLabel>At risk</SectionLabel>
          <div className="mt-1.5 tnum text-lg font-semibold text-crimson">{clients.filter((c) => c.health === "AT_RISK").length}</div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 border-b border-line pb-2 text-[12px] font-medium text-muted">
          Clients <span className="tnum text-faint">{filtered.length}</span>
        </div>
        {filtered.length === 0 && f.active && <NoMatches filter={f} />}
        {filtered.map((c) => {
          const hc = HEALTH_COLOR[c.health] ?? "var(--muted)";
          return (
            <div
              key={c.id}
              data-row-id={c.id}
              className={cn(
                "flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-1 py-2 hover:bg-hover",
                (activeId === c.id || selectedId === c.id) && "bg-hover"
              )}
              onClick={() => { setActiveId(c.id); setSelectedId(c.id); }}
            >
              <Dot color={hc} />
              <div className="min-w-[180px] flex-1">
                <EntityLink entity={{ type: "client", id: c.id, name: c.name }} className="truncate text-[13px]" />
                <div className="truncate text-[12px] text-muted">
                  {c.industry ?? "—"}{c.tier ? ` · ${c.tier}` : ""}
                </div>
              </div>
              <span className="tnum text-[12px] text-muted">{c.projects.length} projects</span>
              <span className="tnum text-[12px] text-muted">{c.tasks.length} tasks</span>
              <div className="flex w-[100px] items-center justify-end gap-1">
                {c.owners.slice(0, 3).map((o) => (
                  <span key={o.id} title={o.name}>
                    <Avatar name={o.name} size={20} />
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !f.active && (
          <div className="py-10 text-center text-[13px] text-muted">No clients match this filter.</div>
        )}
      </div>

      <ClientDetailDrawer
        client={selected}
        open={selectedId != null && !wide}
        onClose={() => setSelectedId(null)}
        onEditDone={() => { setSelectedId(null); window.location.reload(); }}
      />

      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); window.location.reload(); }}
        />
      )}
    </div>
    </StickyList>
  );
}

function FolderKanbanIcon() { return <span className="text-tealhi">▤</span>; }
function TasksIcon() { return <span className="text-amber">☑</span>; }

/**
 * New client modal — creates via POST /api/clients (server gated on
 * crm.manage), then the parent reloads to show it. Includes the optional name /
 * industry / tier / health / description fields surfaced in the create API.
 */
function NewClientModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", industry: "", tier: "", health: "HEALTHY", description: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || !form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        tier: form.tier.trim() || null,
        health: form.health as "HEALTHY" | "WATCH" | "AT_RISK",
        description: form.description.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      toast("Client created", "success");
      onSaved();
    } else {
      toast(data.error ?? "Create failed", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 anim-fade" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-edge bg-raised p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
            <Plus className="h-4 w-4 text-tealhi" /> New client
          </h3>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="label mb-1">Name</div>
            <input
              className={nyf}
              value={form.name}
              placeholder="Client / company name"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Industry</div>
              <input className={nyf} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            <div>
              <div className="label mb-1">Tier</div>
              <input className={nyf} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} />
            </div>
          </div>
          <div>
            <div className="label mb-1">Health</div>
            <div className="flex gap-2">
              {["HEALTHY", "WATCH", "AT_RISK"].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setForm({ ...form, health: h })}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-[12px]",
                    form.health === h ? "bg-hover text-ink" : "border-edge text-muted"
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1">Description</div>
            <textarea className={cn(nyf, "resize-none")} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-md border border-edge px-3 py-1.5 text-[12px] text-muted hover:bg-bg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
 className="flex items-center gap-1.5 rounded-md bg-tealhi h-8 px-3 text-[13px] font-medium text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Create client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const nyf =
  "w-full rounded-md border border-edge bg-transparent px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none";