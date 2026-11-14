"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, FolderKanban } from "lucide-react";

const SERVICE_OPTIONS = [
  { value: "digital-marketing", label: "Digital Marketing" },
  { value: "development", label: "Development" },
  { value: "digital-marketing+development", label: "Digital Marketing + Development" },
] as const;

const STATUS_OPTIONS = [
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "OFFBOARDED", label: "Offboarded" },
] as const;

export interface ProjectModalEmployee {
  id: string;
  name: string;
  role: string;
  title?: string | null;
  departmentSlug?: string | null;
}

export interface ProjectModalClient {
  id: string;
  name: string;
}

interface ProjectFormData {
  id?: string;
  clientId: string;
  name: string;
  category: string;
  status: string;
  description: string;
  ownerId: string;
  startDate: string;
  endDate: string;
}

export function NewProjectModal({
  open,
  onClose,
  clients,
  employees,
  prefillClientId,
  editProject,
}: {
  open: boolean;
  onClose: () => void;
  clients: ProjectModalClient[];
  employees: ProjectModalEmployee[];
  prefillClientId?: string;
  editProject?: {
    id: string;
    name: string;
    category: string | null;
    status: string;
    description: string | null;
    clientId: string;
    ownerId: string | null;
    startDate?: string | null;
    endDate?: string | null;
  };
}) {
  const router = useRouter();
  const isEdit = !!editProject;

  const [form, setForm] = useState<ProjectFormData>({
    id: editProject?.id,
    clientId: editProject?.clientId ?? prefillClientId ?? "",
    name: editProject?.name ?? "",
    category: editProject?.category ?? "digital-marketing",
    status: editProject?.status ?? "ONBOARDING",
    description: editProject?.description ?? "",
    ownerId: editProject?.ownerId ?? "",
    startDate: editProject?.startDate ? editProject.startDate.slice(0, 10) : "",
    endDate: editProject?.endDate ? editProject.endDate.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const hasDM = form.category.includes("digital-marketing");
  const hasDev = form.category.includes("development");
  const relevantSlugs = [...new Set([
    "leadership",
    ...(hasDM ? ["dm", "design", "sales"] : []),
    ...(hasDev ? ["dev", "design"] : []),
  ])];

  const deptLabel: Record<string, string> = {
    leadership: "Leadership",
    dm: "Digital Marketing",
    design: "Design",
    dev: "Development",
    sales: "Sales",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        category: form.category || null,
        description: form.description || null,
        ownerId: form.ownerId || null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      };

      let res: Response;
      if (isEdit && form.id) {
        body.status = form.status;
        res = await fetch(`/api/projects/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        body.clientId = form.clientId;
        res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to save project");
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 anim-fade" onMouseDown={onClose}>
      <div
        className="relative flex w-full max-w-lg flex-col rounded-xl border border-edge bg-raised shadow-2xl max-h-[90vh] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-edge px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal/20 text-tealhi">
            <FolderKanban className="h-4.5 w-4.5" />
          </div>
          <h2 className="flex-1 text-[15px] font-semibold text-ink">
            {isEdit ? "Edit Project" : "New Project"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-y-auto">
          <div className="space-y-4 px-5 py-4">
            {!isEdit && (
              <div>
                <label className="label mb-1 block">Client *</label>
                <select
                  required
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label mb-1 block">Project Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Q4 Social Media Campaign"
                className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
              />
            </div>

            <div>
              <label className="label mb-2 block">Services</label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: opt.value }))}
                    className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
                      form.category === opt.value
                        ? "border-teal bg-teal/15 text-tealhi"
                        : "border-edge bg-bg text-muted hover:border-teal/50 hover:text-ink"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {isEdit && (
              <div>
                <label className="label mb-1 block">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label mb-1 block">Delivery Owner</label>
              <select
                value={form.ownerId}
                onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
              >
                <option value="">Unassigned</option>
                {employees
                  .filter((e) => ["ACCOUNT_MANAGER", "DEPARTMENT_HEAD", "TEAM_LEAD", "SUPER_ADMIN", "SENIOR_EXECUTIVE"].includes(e.role))
                  .map((e) => (
                    <option key={e.id} value={e.id}>{e.name}{e.title ? ` -- ${e.title}` : ""}</option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="label mb-1 block">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="label mb-1 block">Description / Notes</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Scope, goals, context..."
                className="w-full resize-none rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-teal focus:outline-none"
              />
            </div>

            {relevantSlugs.some((slug) => employees.some((e) => e.departmentSlug === slug)) && (
              <div>
                <label className="label mb-2 block">Departments Involved</label>
                <div className="space-y-2 rounded-lg border border-edge bg-bg p-3">
                  {relevantSlugs.map((slug) => {
                    const deptEmps = employees.filter((e) => e.departmentSlug === slug);
                    if (deptEmps.length === 0) return null;
                    return (
                      <div key={slug}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{deptLabel[slug] ?? slug}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {deptEmps.map((e) => (
                            <span key={e.id} className="rounded-full border border-edge bg-raised px-2 py-0.5 text-[11px] text-ink">
                              {e.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-faint">Assign tasks to these members after creating the project.</p>
              </div>
            )}

            {error && <p className="text-[12px] text-crimson">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-edge px-4 py-2 text-[13px] text-muted hover:text-ink">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-teal px-4 py-2 text-[13px] font-medium text-white hover:bg-tealhi disabled:opacity-50">
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}