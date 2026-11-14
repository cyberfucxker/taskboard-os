"use client";

import { useState, useEffect } from "react";
import { Check, X, RefreshCw, FolderKanban, Building2, Layers, Users, Sparkles, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useSession } from "next-auth/react";

export interface RoutinePreset {
  id: string;
  title: string;
  department: string;
  category: "DEVELOPMENT" | "DESIGN" | "BUG_FIX" | "CRM" | "MEETING" | "ADMIN" | "DOCUMENTATION" | "OTHER";
  crossFunctionalDepts?: string[];
  defaultDescription: string;
  defaultPriority: "P0" | "P1" | "P2" | "P3";
  estimateHrs: number;
}

export const DESIGNATION_ROUTINE_PRESETS: Record<string, RoutinePreset[]> = {
  Development: [
    {
      id: "dev-pr-review",
      title: "Daily PR Triage & Code Review",
      department: "DEVELOPMENT",
      category: "DEVELOPMENT",
      defaultDescription: "Review pending pull requests, check test coverage, and approve clean merges for staging deployment.",
      defaultPriority: "P1",
      estimateHrs: 1.5,
    },
    {
      id: "dev-sprint-feature",
      title: "Feature Implementation & Unit Tests",
      department: "DEVELOPMENT",
      category: "DEVELOPMENT",
      defaultDescription: "Implement assigned sprint backlog features, adherence to architecture conventions, and write regression tests.",
      defaultPriority: "P1",
      estimateHrs: 4,
    },
    {
      id: "dev-bug-fixes",
      title: "Sprint Bug Fixes & Sentry Error Resolution",
      department: "DEVELOPMENT",
      category: "BUG_FIX",
      defaultDescription: "Investigate and resolve critical bug tickets and production exception logs reported in Sentry.",
      defaultPriority: "P1",
      estimateHrs: 2,
    },
    {
      id: "dev-seo-implementation",
      title: "Technical SEO & Web Performance Optimization",
      department: "DEVELOPMENT",
      crossFunctionalDepts: ["DEVELOPMENT", "DIGITAL_MARKETING"],
      category: "DEVELOPMENT",
      defaultDescription: "Implement Core Web Vitals optimizations, structured schema markup, and metadata requested by SEO team.",
      defaultPriority: "P2",
      estimateHrs: 3,
    },
  ],
  "Digital Marketing": [
    {
      id: "dm-seo-audit",
      title: "Technical SEO Audit & On-Page Implementation",
      department: "DIGITAL_MARKETING",
      crossFunctionalDepts: ["DIGITAL_MARKETING", "DEVELOPMENT"],
      category: "DEVELOPMENT",
      defaultDescription: "Perform deep site crawl, check indexing anomalies, keyword density, and coordinate fixes with development team.",
      defaultPriority: "P1",
      estimateHrs: 3,
    },
    {
      id: "dm-ads-optimization",
      title: "Google / Meta Ads Budget & ROAS Optimization",
      department: "DIGITAL_MARKETING",
      category: "CRM",
      defaultDescription: "Audit daily spend, CPC metrics, conversion tracking pixels, and adjust bidding strategies for peak performance.",
      defaultPriority: "P1",
      estimateHrs: 2,
    },
    {
      id: "dm-keyword-research",
      title: "Keyword Cluster Analysis & Content Briefs",
      department: "DIGITAL_MARKETING",
      category: "DOCUMENTATION",
      defaultDescription: "Analyze competitor ranking keywords, search volume intent, and prepare detailed content outlines for writers.",
      defaultPriority: "P2",
      estimateHrs: 2.5,
    },
    {
      id: "dm-cro-analysis",
      title: "Conversion Rate Optimization & Funnel Review",
      department: "DIGITAL_MARKETING",
      crossFunctionalDepts: ["DIGITAL_MARKETING", "DESIGN"],
      category: "OTHER",
      defaultDescription: "Review landing page user drop-offs, conduct heat-map reviews, and prepare UI split-testing hypotheses.",
      defaultPriority: "P2",
      estimateHrs: 2,
    },
  ],
  Design: [
    {
      id: "des-wireframe-review",
      title: "UI/UX Wireframes & Component Specs",
      department: "DESIGN",
      category: "DESIGN",
      defaultDescription: "Create wireframes, high-fidelity responsive component designs, and design tokens in Figma.",
      defaultPriority: "P1",
      estimateHrs: 3.5,
    },
    {
      id: "des-handoff",
      title: "Dev Handoff & Design QA",
      department: "DESIGN",
      crossFunctionalDepts: ["DESIGN", "DEVELOPMENT"],
      category: "DESIGN",
      defaultDescription: "Inspect staging implementation for visual fidelity, typography hierarchy, responsiveness, and report deviations.",
      defaultPriority: "P2",
      estimateHrs: 2,
    },
  ],
  Sales: [
    {
      id: "sales-pipeline-update",
      title: "Daily CRM Pipeline & Lead Follow-ups",
      department: "SALES",
      category: "CRM",
      defaultDescription: "Review hot leads in CRM, execute scheduled follow-up calls/emails, and update stage probabilities.",
      defaultPriority: "P1",
      estimateHrs: 2.5,
    },
    {
      id: "sales-strategy-call",
      title: "Client Scope & Requirements Call",
      department: "SALES",
      crossFunctionalDepts: ["SALES", "DEVELOPMENT"],
      category: "MEETING",
      defaultDescription: "Conduct client discovery call to document functional deliverables, budget milestones, and technical requirements.",
      defaultPriority: "P1",
      estimateHrs: 1.5,
    },
  ],
  Leadership: [
    {
      id: "lead-standup-blockers",
      title: "Daily Standup & Blocker Clearing",
      department: "LEADERSHIP",
      category: "MEETING",
      defaultDescription: "Facilitate daily sync, unblock flagged team dependencies, and rebalance daily sprint workload.",
      defaultPriority: "P0",
      estimateHrs: 1,
    },
    {
      id: "lead-qa-release",
      title: "Sprint Milestone QA & Sign-Off",
      department: "LEADERSHIP",
      crossFunctionalDepts: ["LEADERSHIP", "DEVELOPMENT", "DESIGN"],
      category: "ADMIN",
      defaultDescription: "Verify acceptance criteria on milestone deliverables before staging/production deployment and client demo.",
      defaultPriority: "P1",
      estimateHrs: 2,
    },
  ],
};

interface ProjectOption {
  id: string;
  name: string;
  client?: { id: string; name: string } | null;
}

interface StartRecurringTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialPreset?: Partial<RoutinePreset> | null;
}

export function StartRecurringTaskModal({
  open,
  onClose,
  onSuccess,
  initialPreset,
}: StartRecurringTaskModalProps) {
  const toast = useToast();
  const { data: session } = useSession();

  const [selectedDeptGroup, setSelectedDeptGroup] = useState<string>("Development");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Form State
  const [projectId, setProjectId] = useState<string>("");
  const [category, setCategory] = useState<string>("DEVELOPMENT");
  const [crossDepts, setCrossDepts] = useState<string[]>([]);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2" | "P3">("P1");
  const [estimateHrs, setEstimateHrs] = useState<number>(2);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    if (open) {
      setLoadingProjects(true);
      fetch("/api/projects")
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && Array.isArray(data.projects)) {
            setProjects(data.projects);
            if (data.projects.length > 0 && !projectId) {
              setProjectId(data.projects[0].id);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingProjects(false));
    }
  }, [open]);

  // Sync initial preset
  useEffect(() => {
    if (initialPreset) {
      if (initialPreset.title) setTitle(initialPreset.title);
      if (initialPreset.defaultDescription) setDescription(initialPreset.defaultDescription);
      if (initialPreset.category) setCategory(initialPreset.category);
      if (initialPreset.defaultPriority) setPriority(initialPreset.defaultPriority);
      if (initialPreset.estimateHrs) setEstimateHrs(initialPreset.estimateHrs);
      if (initialPreset.crossFunctionalDepts) setCrossDepts(initialPreset.crossFunctionalDepts);
    } else {
      // Pick first preset of selected group
      const presets = DESIGNATION_ROUTINE_PRESETS[selectedDeptGroup] ?? [];
      if (presets.length > 0) {
        applyPreset(presets[0]);
      }
    }
  }, [initialPreset, selectedDeptGroup]);

  function applyPreset(preset: RoutinePreset) {
    setSelectedPresetId(preset.id);
    setTitle(preset.title);
    setDescription(preset.defaultDescription);
    setCategory(preset.category);
    setPriority(preset.defaultPriority);
    setEstimateHrs(preset.estimateHrs);
    setCrossDepts(preset.crossFunctionalDepts ?? [preset.department]);
  }

  if (!open) return null;

  const isDescValid = description.trim().length >= 20;
  const isFormValid = title.trim().length > 0 && isDescValid && projectId.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) {
      setErrorMsg("Please select a project and provide a description (min 20 characters).");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const selectedProj = projects.find((p) => p.id === projectId);
    const projName = selectedProj ? selectedProj.name : "Project";
    const clientId = selectedProj?.client?.id ?? undefined;

    const fullTitle = `[Routine] ${title} — ${projName}`;

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fullTitle,
          description: description.trim(),
          priority,
          category,
          projectId,
          clientId,
          department: crossDepts.join(", "),
          gain: crossDepts.length > 1 ? `Cross-functional: ${crossDepts.join(" + ")}` : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast(`Routine task spawned for ${projName} ✓`, "success");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error ?? "Failed to spawn recurring task");
        toast(data.error ?? "Failed to spawn recurring task", "error");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "An unexpected error occurred.");
      toast("Error creating routine task", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const allDepts = ["DEVELOPMENT", "DIGITAL_MARKETING", "DESIGN", "SALES", "LEADERSHIP", "HR", "FINANCE"];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm anim-fade"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-edge bg-raised p-6 shadow-2xl anim-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hover pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/15 text-tealhi">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-ink">
                Start Designation Routine / Recurring Task
              </h2>
              <p className="text-[12px] text-muted">
                Execute daily SOPs with project assignment & cross-functional department tracking.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 p-2.5 text-[12.5px] text-crimson font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Designation / Department Preset Tabs */}
          <div>
            <label className="label mb-1.5 block text-ink">1. Designation / Department Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(DESIGNATION_ROUTINE_PRESETS).map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDeptGroup(dept)}
                  className={`rounded-md px-3 py-1 text-[12px] font-medium transition ${
                    selectedDeptGroup === dept
                      ? "bg-teal text-bg font-semibold"
                      : "bg-surface border border-edge text-muted hover:text-ink"
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>

            {/* Presets within group */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {DESIGNATION_ROUTINE_PRESETS[selectedDeptGroup]?.map((p) => {
                const isSelected = selectedPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition ${
                      isSelected
                        ? "border-teal bg-teal/10 text-tealhi font-medium"
                        : "border-edge bg-bg text-ink hover:border-hover"
                    }`}
                  >
                    <span className="text-[12.5px] font-medium flex items-center justify-between w-full">
                      <span>{p.title}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal shrink-0 ml-1" />}
                    </span>
                    <span className="mt-0.5 text-[11px] text-muted">
                      {p.category} · ~{p.estimateHrs}h
                      {p.crossFunctionalDepts && p.crossFunctionalDepts.length > 1 && (
                        <span className="ml-1.5 text-amber font-mono text-[10px]">
                          [Cross-Functional]
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Project & Client Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5 flex items-center gap-1.5 text-ink">
                <FolderKanban className="h-3.5 w-3.5 text-teal" /> Target Project{" "}
                <span className="text-crimson">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                required
              >
                {loadingProjects ? (
                  <option value="">Loading projects...</option>
                ) : projects.length === 0 ? (
                  <option value="">No active projects found</option>
                ) : (
                  projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name} {proj.client ? `(${proj.client.name})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="label mb-1.5 flex items-center gap-1.5 text-ink">
                <Layers className="h-3.5 w-3.5 text-teal" /> Department Task Type / Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
              >
                <option value="DEVELOPMENT">Development & Engineering</option>
                <option value="DESIGN">Design & Creative</option>
                <option value="BUG_FIX">Bug Fix / Hotfix</option>
                <option value="CRM">CRM / Sales / Marketing</option>
                <option value="MEETING">Meeting & Strategy Call</option>
                <option value="ADMIN">Admin / Leadership Review</option>
                <option value="DOCUMENTATION">Documentation & SOP</option>
                <option value="OTHER">Other / Cross-Dept</option>
              </select>
            </div>
          </div>

          {/* Cross-functional Departments */}
          <div>
            <label className="label mb-1.5 flex items-center justify-between text-ink">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-amber" /> Cross-Functional Departments Involved
              </span>
              <span className="text-[11px] text-muted font-normal">
                e.g. SEO Implementation (Dev + Marketing)
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allDepts.map((d) => {
                const active = crossDepts.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      if (active) {
                        if (crossDepts.length > 1) {
                          setCrossDepts(crossDepts.filter((x) => x !== d));
                        }
                      } else {
                        setCrossDepts([...crossDepts, d]);
                      }
                    }}
                    className={`rounded border px-2 py-1 text-[11px] font-mono transition ${
                      active
                        ? "border-teal bg-teal/15 text-teal font-semibold"
                        : "border-edge bg-bg text-muted hover:text-ink"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="label mb-1.5 block text-ink">
                Routine Action Item <span className="text-crimson">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Technical SEO Audit & Core Web Vitals"
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="label mb-1.5 block text-ink">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-[13px] text-ink focus:border-teal focus:outline-none"
              >
                <option value="P0">P0 — Critical / Blocker</option>
                <option value="P1">P1 — High</option>
                <option value="P2">P2 — Medium</option>
                <option value="P3">P3 — Low</option>
              </select>
            </div>
          </div>

          {/* Description / Deliverable requirements */}
          <div>
            <label className="label mb-1.5 block text-ink">
              Work Order / Execution Scope <span className="text-crimson">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="State the execution steps, target URLs/modules, and expected output (minimum 20 characters)..."
              className={`w-full rounded-md border bg-bg p-3 text-[13px] text-ink placeholder:text-faint focus:outline-none transition resize-none ${
                description.length > 0 && !isDescValid
                  ? "border-crimson/50 focus:border-crimson"
                  : "border-edge focus:border-teal"
              }`}
              required
            />
            <div className="mt-1 flex items-center justify-between text-[11.5px]">
              <span className={isDescValid ? "text-teal font-medium" : "text-muted"}>
                {isDescValid ? "✓ Scope details valid" : "Describe execution scope (minimum 20 characters)"}
              </span>
              <span
                className={`font-mono ${
                  isDescValid ? "text-teal font-bold" : "text-crimson font-medium"
                }`}
              >
                {description.trim().length}/20 chars
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hover pt-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-hover px-3.5 py-1.5 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="rounded-md bg-teal px-4 py-1.5 text-[13px] font-semibold text-bg transition hover:bg-tealhi disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="h-4 w-4" />
              <span>{submitting ? "Spawning Task..." : "Spawn Routine Work Order"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
