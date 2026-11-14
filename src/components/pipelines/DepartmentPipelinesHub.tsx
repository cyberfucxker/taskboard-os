"use client";

import { useState, useEffect } from "react";
import { useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { useRouter } from "next/navigation";
import {
  Code2,
  Palette,
  Briefcase,
  TrendingUp,
  HeartPulse,
  Sparkles,
  Plus,
  ArrowRight,
  Layers,
  CheckCircle2,
  Clock,
  Shield,
  FolderPlus,
  Play,
  Edit3,
  Trash2,
  X,
  ChevronRight,
  CheckSquare,
  Building2,
  User,
  Zap,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { DepartmentPipeline, PipelineTaskTemplate } from "@/app/api/pipelines/route";

interface ClientOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
  client?: { name: string } | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  role: string;
  title?: string | null;
}

const DEPT_TABS = [
  { slug: "all", label: "All Pipelines", icon: Layers, color: "text-ink" },
  { slug: "dev", label: "Engineering / Dev", icon: Code2, color: "text-tealhi" },
  { slug: "design", label: "UI/UX Design", icon: Palette, color: "text-pink" },
  { slug: "sales", label: "Sales & Growth", icon: Briefcase, color: "text-emerald" },
  { slug: "dm", label: "Digital Marketing", icon: TrendingUp, color: "text-amber" },
  { slug: "hr", label: "HR & People Ops", icon: HeartPulse, color: "text-muted" },
] as const;

export function DepartmentPipelinesHub({
  initialPipelines = [],
  clients = [],
  projects = [],
  employees = [],
  currentUserId,
}: {
  initialPipelines?: DepartmentPipeline[];
  clients?: ClientOption[];
  projects?: ProjectOption[];
  employees?: EmployeeOption[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [pipelines, setPipelines] = useState<DepartmentPipeline[]>(initialPipelines);
  // Realtime: this hub loads its own data, so refetch on change. (Syncing from the
  // initialPipelines prop looped forever: it defaults to a fresh [] on every render.)
  useOnLiveChange(() => { loadPipelines(); });
  const [loading, setLoading] = useState(false);

  // Modals state
  const [launchModalPipeline, setLaunchModalPipeline] = useState<DepartmentPipeline | null>(null);
  const [applyModalPipeline, setApplyModalPipeline] = useState<DepartmentPipeline | null>(null);
  const [editorPipeline, setEditorPipeline] = useState<DepartmentPipeline | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Launch Project form state
  const [projectName, setProjectName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(currentUserId ?? "");
  const [launching, setLaunching] = useState(false);

  // Apply to existing project form state
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [applying, setApplying] = useState(false);

  const [seesAllDepartments, setSeesAllDepartments] = useState(true);
  const [viewerDeptSlug, setViewerDeptSlug] = useState<string | null>(null);

  // Custom Pipeline Editor state
  const [editName, setEditName] = useState("");
  const [editDeptSlug, setEditDeptSlug] = useState("dev");
  const [editDesc, setEditDesc] = useState("");
  const [editTasks, setEditTasks] = useState<PipelineTaskTemplate[]>([]);
  const [savingPipeline, setSavingPipeline] = useState(false);

  async function loadPipelines() {
    setLoading(true);
    try {
      const res = await fetch("/api/pipelines");
      const data = await res.json();
      if (data.ok) {
        setPipelines(data.all ?? []);
        setSeesAllDepartments(data.seesAllDepartments ?? true);
        setViewerDeptSlug(data.viewerDeptSlug ?? null);
        if (!(data.seesAllDepartments ?? true) && data.viewerDeptSlug) {
          setSelectedDept(data.viewerDeptSlug);
        }
      }
    } catch {
      toast("Could not load pipelines", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPipelines.length === 0) {
      loadPipelines();
    }
  }, []);

  const filteredPipelines = pipelines.filter((p) => {
    if (selectedDept === "all") return true;
    return p.departmentSlug === selectedDept;
  });

  function openLaunchModal(pipeline: DepartmentPipeline) {
    setLaunchModalPipeline(pipeline);
    setProjectName(`${pipeline.name.split(" ")[0]} - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    setSelectedClientId(clients[0]?.id ?? "");
    setSelectedOwnerId(currentUserId ?? employees[0]?.id ?? "");
  }

  function openApplyModal(pipeline: DepartmentPipeline) {
    setApplyModalPipeline(pipeline);
    setSelectedProjectId(projects[0]?.id ?? "");
  }

  function openCreateModal() {
    setIsCreatingNew(true);
    setEditName("");
    setEditDeptSlug("dev");
    setEditDesc("");
    setEditTasks([
      {
        title: "1. Initial Requirement Scope & Kickoff",
        category: "OTHER",
        priority: "P1",
        estimateHrs: 4,
        gainLever: "Clear scope alignment",
        subtasks: [{ title: "Define acceptance criteria" }, { title: "Assign owner and review timeline" }],
      },
      {
        title: "2. Execution & Review Deliverable",
        category: "OTHER",
        priority: "P0",
        estimateHrs: 8,
        gainLever: "High-quality delivery",
        subtasks: [{ title: "Execute core deliverable" }, { title: "Perform QA / peer review" }],
      },
    ]);
  }

  async function handleLaunchProject() {
    if (!launchModalPipeline || !projectName.trim()) {
      toast("Please enter a project name", "error");
      return;
    }
    setLaunching(true);
    try {
      const res = await fetch("/api/pipelines/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineId: launchModalPipeline.id,
          projectName: projectName.trim(),
          clientId: selectedClientId || undefined,
          ownerId: selectedOwnerId || undefined,
          taskOverrides: launchModalPipeline.tasks,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(`🚀 Launched project with ${data.tasksCreatedCount} tasks!`, "success");
        setLaunchModalPipeline(null);
        router.push(`/projects/${data.projectId}`);
      } else {
        toast(data.error ?? "Failed to launch project", "error");
      }
    } catch {
      toast("Network error while launching project", "error");
    } finally {
      setLaunching(false);
    }
  }

  async function handleApplyToProject() {
    if (!applyModalPipeline || !selectedProjectId) {
      toast("Please select a project", "error");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/pipelines/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineId: applyModalPipeline.id,
          projectId: selectedProjectId,
          taskOverrides: applyModalPipeline.tasks,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(`⚡ Added ${data.tasksCreatedCount} tasks from pipeline to project!`, "success");
        setApplyModalPipeline(null);
        router.push(`/projects/${selectedProjectId}`);
      } else {
        toast(data.error ?? "Failed to apply pipeline", "error");
      }
    } catch {
      toast("Network error while applying pipeline", "error");
    } finally {
      setApplying(false);
    }
  }

  async function handleSaveCustomPipeline() {
    if (!editName.trim()) {
      toast("Please provide a pipeline name", "error");
      return;
    }
    if (editTasks.length === 0) {
      toast("Please add at least one task", "error");
      return;
    }
    setSavingPipeline(true);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          departmentSlug: editDeptSlug,
          description: editDesc.trim(),
          tasks: editTasks,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast("Custom Department Pipeline created!", "success");
        setIsCreatingNew(false);
        loadPipelines();
      } else {
        toast(data.error ?? "Could not save pipeline", "error");
      }
    } catch {
      toast("Network error saving pipeline", "error");
    } finally {
      setSavingPipeline(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/20 text-tealhi">
              <Layers className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-ink">Department Workflows & Pipeline Templates</h2>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Predefined, standardized SOP task streams per department. Modifiable and launchable in 1 click.
          </p>
        </div>

        <button
          onClick={openCreateModal}
 className="inline-flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white transition hover:bg-tealhi"
        >
          <Plus className="h-3.5 w-3.5" /> Create Custom Pipeline
        </button>
      </div>

      {/* Department Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-edge pb-3">
        {DEPT_TABS.filter((tab) => seesAllDepartments || tab.slug === viewerDeptSlug).map((tab) => {
          const Icon = tab.icon;
          const active = selectedDept === tab.slug;
          return (
            <button
              key={tab.slug}
              onClick={() => setSelectedDept(tab.slug)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-hover text-ink border border-edge"
                  : "text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${tab.color}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Pipeline Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredPipelines.map((pipeline) => {
          return (
            <div
              key={pipeline.id}
              className="flex flex-col rounded-[10px] border border-edge bg-raised p-4 transition hover:border-edge"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3 border-b border-edge pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold tnum"
                      style={{
                        background: `${pipeline.color}15`,
                        color: pipeline.color,
                        border: `1px solid ${pipeline.color}30`,
                      }}
                    >
                      {pipeline.departmentName}
                    </span>
                    {pipeline.isCustom && (
                      <span className="px-1.5 py-0.5 rounded text-[11px] bg-teal/20 text-tealhi">Custom</span>
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-ink">{pipeline.name}</h3>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{pipeline.description}</p>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-[11px] text-muted tnum">
                    <Clock className="h-3 w-3" /> ~{pipeline.estimatedDays} days
                  </div>
                  <div className="text-[11px] text-tealhi tnum mt-0.5">{pipeline.tasks.length} standard tasks</div>
                </div>
              </div>

              {/* Tasks List Preview */}
              <div className="my-3 flex-1 space-y-2 max-h-60 overflow-y-auto pr-1">
                {pipeline.tasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-edge bg-bg p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink line-clamp-1">{task.title}</span>
                      <span
                        className={`text-[11px] tnum px-1.5 py-0.2 rounded font-bold ${
                          task.priority === "P0"
                            ? "bg-crimson/20 text-crimson"
                            : task.priority === "P1"
                            ? "bg-amber/20 text-amber"
                            : "bg-tealhi/20 text-tealhi"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    {task.subtasks.length > 0 && (
                      <div className="space-y-1 pl-1">
                        {task.subtasks.slice(0, 3).map((st, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-1.5 text-[11px] text-muted">
                            <CheckSquare className="h-3 w-3 shrink-0 text-edge" />
                            <span className="truncate">{st.title}</span>
                          </div>
                        ))}
                        {task.subtasks.length > 3 && (
                          <div className="text-[11px] text-faint pl-4">+{task.subtasks.length - 3} more subtasks</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Card Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-edge">
                <button
                  onClick={() => openLaunchModal(pipeline)}
 className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-edge bg-raised text-ink hover:bg-hover h-8 px-3 text-[13px] font-medium transition"
                >
                  <Play className="h-3 w-3" /> Launch New Project
                </button>

                <button
                  onClick={() => openApplyModal(pipeline)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-hover border border-edge px-3 py-1.5 text-xs font-medium text-ink hover:bg-edge transition"
                >
                  <Zap className="h-3 w-3 text-amber" /> Apply to Existing
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===================== MODAL: LAUNCH NEW PROJECT ===================== */}
      {launchModalPipeline && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-[10px] border border-edge bg-raised p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-tealhi" />
                <h3 className="text-sm font-bold text-ink">Launch Project from Pipeline</h3>
              </div>
              <button
                onClick={() => setLaunchModalPipeline(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-transparent p-3 border border-edge">
              <div className="text-[11px] tnum text-tealhi">{launchModalPipeline.departmentName}</div>
              <div className="text-xs font-bold text-ink">{launchModalPipeline.name}</div>
              <div className="text-[11px] text-muted mt-0.5">{launchModalPipeline.tasks.length} tasks will be created automatically with checklists and priorities.</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
                  placeholder="e.g. Acme SaaS - MVP Sprint"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted">Client</label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
                  >
                    <option value="">No Client (Internal)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-muted">Project Lead</label>
                  <select
                    value={selectedOwnerId}
                    onChange={(e) => setSelectedOwnerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => setLaunchModalPipeline(null)}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                disabled={launching || !projectName.trim()}
                onClick={handleLaunchProject}
 className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi transition disabled:opacity-50"
              >
                {launching ? "Creating Project…" : "Launch Project & Tasks →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: APPLY TO EXISTING PROJECT ===================== */}
      {applyModalPipeline && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[10px] border border-edge bg-raised p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber" />
                <h3 className="text-sm font-bold text-ink">Apply Pipeline to Existing Project</h3>
              </div>
              <button
                onClick={() => setApplyModalPipeline(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted">Target Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.client ? `(${p.client.name})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-muted">
              This will add all <span className="text-ink font-bold">{applyModalPipeline.tasks.length} tasks</span> from{" "}
              <span className="text-tealhi font-semibold">{applyModalPipeline.name}</span> directly into the chosen project.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => setApplyModalPipeline(null)}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                disabled={applying || !selectedProjectId}
                onClick={handleApplyToProject}
 className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi transition disabled:opacity-50"
              >
                {applying ? "Applying…" : "Generate Tasks →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE CUSTOM PIPELINE ===================== */}
      {isCreatingNew && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[10px] border border-edge bg-raised p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-teal" />
                <h3 className="text-sm font-bold text-ink">Create Custom Department Pipeline</h3>
              </div>
              <button
                onClick={() => setIsCreatingNew(false)}
                className="text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted">Pipeline Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Flutter Mobile MVP Pipeline"
                  className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-muted">Department</label>
                <select
                  value={editDeptSlug}
                  onChange={(e) => setEditDeptSlug(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
                >
                  <option value="dev">Engineering / Dev</option>
                  <option value="design">UI/UX Design</option>
                  <option value="sales">Sales & Growth</option>
                  <option value="dm">Digital Marketing</option>
                  <option value="hr">HR & People Ops</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-muted">Description / SOP Goal</label>
              <textarea
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Brief summary of when and how this pipeline should be executed."
                className="mt-1 w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-xs text-ink focus:border-teal focus:outline-none"
              />
            </div>

            {/* Tasks Builder */}
            <div className="space-y-3 border-t border-edge pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Pipeline Tasks ({editTasks.length})</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditTasks([
                      ...editTasks,
                      {
                        title: `${editTasks.length + 1}. New Stage Task`,
                        category: "OTHER",
                        priority: "P1",
                        estimateHrs: 4,
                        subtasks: [{ title: "First checklist step" }],
                      },
                    ])
                  }
                  className="flex items-center gap-1 rounded bg-hover px-2 py-1 text-[11px] text-tealhi hover:bg-edge"
                >
                  <Plus className="h-3 w-3" /> Add Task Stage
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {editTasks.map((t, idx) => (
                  <div key={idx} className="rounded-lg border border-edge bg-bg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={t.title}
                        onChange={(e) => {
                          const updated = [...editTasks];
                          updated[idx].title = e.target.value;
                          setEditTasks(updated);
                        }}
                        className="flex-1 rounded border border-edge bg-raised px-2 py-1 text-xs text-ink focus:border-teal focus:outline-none"
                      />
                      <select
                        value={t.priority}
                        onChange={(e) => {
                          const updated = [...editTasks];
                          updated[idx].priority = e.target.value as any;
                          setEditTasks(updated);
                        }}
                        className="rounded border border-edge bg-raised px-2 py-1 text-[11px] text-ink"
                      >
                        <option value="P0">P0 (Urgent)</option>
                        <option value="P1">P1 (High)</option>
                        <option value="P2">P2 (Medium)</option>
                        <option value="P3">P3 (Low)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setEditTasks(editTasks.filter((_, i) => i !== idx))}
                        className="text-muted hover:text-crimson"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Subtasks */}
                    <div className="space-y-1.5 pl-2 border-l border-edge">
                      {t.subtasks.map((st, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-1.5">
                          <CheckSquare className="h-3 w-3 text-faint" />
                          <input
                            type="text"
                            value={st.title}
                            onChange={(e) => {
                              const updated = [...editTasks];
                              updated[idx].subtasks[sIdx].title = e.target.value;
                              setEditTasks(updated);
                            }}
                            placeholder="Checklist step"
                            className="flex-1 rounded border border-edge bg-raised px-2 py-0.5 text-[11px] text-ink focus:border-teal focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...editTasks];
                              updated[idx].subtasks = updated[idx].subtasks.filter((_, i) => i !== sIdx);
                              setEditTasks(updated);
                            }}
                            className="text-muted hover:text-crimson"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...editTasks];
                          updated[idx].subtasks.push({ title: "Next checklist item" });
                          setEditTasks(updated);
                        }}
                        className="text-[11px] text-tealhi hover:underline"
                      >
                        + Add Checklist Step
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => setIsCreatingNew(false)}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                disabled={savingPipeline || !editName.trim() || editTasks.length === 0}
                onClick={handleSaveCustomPipeline}
 className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi transition disabled:opacity-50"
              >
                {savingPipeline ? "Saving Pipeline…" : "Save Custom Pipeline →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
