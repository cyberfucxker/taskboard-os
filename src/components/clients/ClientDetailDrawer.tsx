"use client";

import { useState } from "react";
import { X, Users, FolderKanban, CheckSquare, Building2, Pencil, Save, Trash2 } from "lucide-react";
import { Avatar, Badge, SectionLabel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

export interface ClientDetailTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueLabel: string | null;
  assignee: string | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  industry: string | null;
  region: string | null;
  tier: string | null;
  health: string;
  description: string | null;
  owners: { id: string; name: string }[];
  projects: { id: string; name: string; status: string }[];
  tasks: ClientDetailTask[];
}

const HEALTH_COLOR: Record<string, string> = { HEALTHY: "var(--emerald)", WATCH: "var(--amber)", AT_RISK: "var(--crimson)" };

/**
 * Client detail drawer — linked vault view. Shows who owns the client (multiple),
 * the projects bought, and every task lined up for that client. Clicking a task
 * jumps to it; the drawer itself is opened by clicking a client name anywhere.
 */
export function ClientDetailDrawer({
  client,
  open,
  onClose,
  onEditDone,
  inline = false,
}: {
  /** Docked pane (wide screens): no overlay, parent supplies the container. */
  inline?: boolean;
  client: ClientDetail | null;
  open: boolean;
  onClose: () => void;
  onEditDone?: () => void;
}) {
  const toast = useToast();
  const [edited, setEdited] = useState<null | { name: string; industry: string; tier: string; health: string; description: string }>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!open || !client) return null;
  // Capture a non-null alias — TS doesn't narrow a function-param `client`
  // inside the nested closures below.
  const c = client;

  function beginEdit() {
    setEdited({
      name: c.name,
      industry: c.industry ?? "",
      tier: c.tier ?? "",
      health: c.health,
      description: c.description ?? "",
    });
  }

  async function saveEdit() {
    if (!edited || saving) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        name: edited.name.trim(),
        industry: edited.industry.trim() || null,
        tier: edited.tier.trim() || null,
        health: edited.health as "HEALTHY" | "WATCH" | "AT_RISK",
        description: edited.description.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setEdited(null);
      toast("Client updated", "success");
      onEditDone?.();
    } else {
      toast(data.error ?? "Update failed", "error");
    }
  }

  async function doDelete() {
    if (deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
    const data = await res.json();
    setDeleting(false);
    if (data.ok) {
      toast("Client deleted", "success");
      onEditDone?.();
    } else {
      // 403 (no crm.manage) and any other failure surface here gracefully.
      setConfirmDelete(false);
      toast(data.error ?? "Delete failed", "error");
    }
  }

  const health = HEALTH_COLOR[client.health] ?? "var(--muted)";

  return (
    <div className={inline ? "flex h-full min-h-0 w-full" : "fixed inset-0 z-[70] flex justify-end bg-black/50 anim-fade"} onMouseDown={inline ? undefined : onClose}>
      <div
        className={inline ? "flex h-full w-full min-w-0 flex-col overflow-hidden bg-raised" : "flex h-full w-full max-w-md flex-col overflow-hidden border-l border-edge bg-raised shadow-xl anim-right"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-edge px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/25 text-tealhi">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">{client.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-serif text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: health }} />
                {client.health}
              </span>
              {client.tier && <Badge text={client.tier} />}
              {client.industry && <span className="text-[11px] text-muted">{client.industry}</span>}
            </div>
          </div>
          <button
            onClick={beginEdit}
            title="Edit client"
            className="text-muted hover:text-ink"
            aria-label="Edit client"
          >
            <Pencil className="h-5 w-5" />
          </button>
          <button
            onClick={() => { setEdited(null); setConfirmDelete(true); }}
            title="Delete client"
            className="text-muted hover:text-crimson"
            aria-label="Delete client"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmDelete ? (
          /* --- Inline delete confirm --- */
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <SectionLabel>Delete client</SectionLabel>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Removing <span className="text-ink">{c.name}</span> hides it from the workspace.
              Its contacts, contracts and owner links are removed too; tasks and projects attached to
              it are left intact.
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-edge px-3 py-1.5 text-[12px] text-muted hover:bg-bg"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
 className="flex items-center gap-1.5 rounded-md bg-crimson h-8 px-3 text-[13px] font-medium text-white disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete client"}
              </button>
            </div>
          </div>
        ) : edited ? (
          /* --- Inline edit form --- */
          <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
            <SectionLabel>Edit client</SectionLabel>
            <div>
              <div className="label mb-1">Name</div>
              <input
                className={f}
                value={edited.name}
                onChange={(e) => setEdited({ ...edited, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Industry</div>
                <input className={f} value={edited.industry} onChange={(e) => setEdited({ ...edited, industry: e.target.value })} />
              </div>
              <div>
                <div className="label mb-1">Tier</div>
                <input className={f} value={edited.tier} onChange={(e) => setEdited({ ...edited, tier: e.target.value })} />
              </div>
            </div>
            <div>
              <div className="label mb-1">Health</div>
              <div className="flex gap-2">
                {["HEALTHY", "WATCH", "AT_RISK"].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setEdited({ ...edited, health: h })}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-[12px]",
                      edited.health === h ? "bg-hover text-ink" : "border-edge text-muted"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-1">Description</div>
              <textarea className={cn(f, "resize-none")} rows={3} value={edited.description} onChange={(e) => setEdited({ ...edited, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEdited(null)} className="rounded-md border border-edge px-3 py-1.5 text-[12px] text-muted hover:bg-bg">
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !edited.name.trim()}
 className="flex items-center gap-1.5 rounded-md bg-tealhi h-8 px-3 text-[13px] font-medium text-white disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Owners */}
            <div className="border-b border-edge px-4 py-3">
              <SectionLabel><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Owners ({client.owners.length})</span></SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {client.owners.length === 0 && <span className="text-[12px] text-muted">No owner assigned.</span>}
                {client.owners.map((o) => (
                  <button
                    key={o.id}
                    className="flex items-center gap-1.5 rounded-full bg-hover px-2 py-0.5 text-[12px] text-ink hover:bg-bg"
                  >
                    <Avatar name={o.name} size={16} /> {o.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Projects */}
            <div className="border-b border-edge px-4 py-3">
              <SectionLabel><span className="inline-flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" /> Projects ({client.projects.length})</span></SectionLabel>
              <div className="mt-2 space-y-1.5">
                {client.projects.length === 0 && <span className="text-[12px] text-muted">No projects yet.</span>}
                {client.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md bg-bg px-2.5 py-1.5">
                    <span className="text-[13px] text-ink">{p.name}</span>
                    <Badge text={p.status} kind="info" />
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks */}
            <div className="px-4 py-3">
              <SectionLabel><span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" /> Tasks ({client.tasks.length})</span></SectionLabel>
              <div className="mt-2 space-y-1">
                {client.tasks.length === 0 && <span className="text-[12px] text-muted">No tasks lined up yet.</span>}
                {client.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-bg">
                    <Badge text={t.priority} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.title}</span>
                    <span className="font-mono text-[11px] text-faint">{t.code}</span>
                    {t.dueLabel && <span className="tnum text-[11px] text-amber">{t.dueLabel}</span>}
                  </div>
                ))}
              </div>
            </div>

            {client.description && (
              <div className="border-t border-edge px-4 py-3">
                <SectionLabel>Notes</SectionLabel>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{client.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const f =
  "w-full rounded-md border border-edge bg-transparent px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none";