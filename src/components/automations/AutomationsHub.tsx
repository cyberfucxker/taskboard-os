"use client";

import { useState, useEffect } from "react";
import { useLiveVersion, useOnLiveChange } from "@/components/realtime/RealtimeProvider";
import { Zap, Play, Plus, ToggleLeft, ToggleRight, Trash2, ChevronRight, Clock, Globe, Users, User, X, Check } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutomationTemplate {
  name: string;
  description: string;
  trigger: { type: string; config: Record<string, any> };
  conditions: any[];
  actions: { type: string; config: Record<string, any> }[];
  scope: "personal" | "department" | "global";
  roles: string[];
  category: string;
}

interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: any;
  conditions: any[];
  actions: any[];
  isActive: boolean;
  scope: "personal" | "department" | "global";
  runCount: number;
  lastRunAt: string | null;
  createdBy: { id: string; name: string; avatarInitials?: string };
  runs: any[];
}

// ─── Template Library ────────────────────────────────────────────────────────

const TEMPLATES: AutomationTemplate[] = [
  // Leadership / SUPER_ADMIN
  {
    name: "Weekly KPI Digest",
    description: "Every Monday 9am — AI generates KPI digest → sends to all dept heads via WhatsApp",
    trigger: { type: "schedule", config: { cron: "0 9 * * 1", label: "Every Monday 9am" } },
    conditions: [],
    actions: [
      { type: "call_ai", config: { prompt: "Generate a concise KPI digest for this week including task completion rate, top leads, and revenue highlights." } },
      { type: "send_whatsapp", config: { to: "dept_heads", message: "{{ai.result}}" } },
    ],
    scope: "global",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD"],
    category: "Leadership",
  },
  {
    name: "Overdue Task Escalation",
    description: "Daily check — tasks overdue >3 days → notify dept head + reassign",
    trigger: { type: "schedule", config: { cron: "0 8 * * *", label: "Daily at 8am" } },
    conditions: [{ field: "task.daysOverdue", operator: "gt", value: 3 }],
    actions: [
      { type: "send_whatsapp", config: { to: "department_head", message: "Overdue alert: {{task.title}} is {{task.daysOverdue}} days past due." } },
    ],
    scope: "global",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD"],
    category: "Leadership",
  },
  {
    name: "New Client Onboarding",
    description: "Client created → create onboarding project + assign to ops",
    trigger: { type: "project_created", config: { tag: "onboarding" } },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "Kickoff call — {{client.name}}", priority: "P1", dueDaysFromNow: 2 } },
      { type: "create_task", config: { title: "Send welcome kit — {{client.name}}", priority: "P2", dueDaysFromNow: 1 } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD"],
    category: "Leadership",
  },
  // Sales / CRM
  {
    name: "Lead Follow-Up Sequence",
    description: "Lead not contacted in 3 days → WhatsApp reminder to assigned rep",
    trigger: { type: "schedule", config: { cron: "0 10 * * *", label: "Daily at 10am" } },
    conditions: [{ field: "lead.daysSinceContact", operator: "gt", value: 3 }],
    actions: [
      { type: "send_whatsapp", config: { to: "lead_owner", message: "Reminder: {{lead.name}} from {{lead.company}} hasn't been contacted in {{lead.daysSinceContact}} days." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD", "ACCOUNT_MANAGER"],
    category: "Sales",
  },
  {
    name: "Hot Lead Alert",
    description: "Lead score >80 → WhatsApp to sales head immediately",
    trigger: { type: "lead_stage_changed", config: {} },
    conditions: [{ field: "lead.score", operator: "gt", value: 80 }],
    actions: [
      { type: "send_whatsapp", config: { to: "sales_head", message: "🔥 Hot lead: {{lead.name}} ({{lead.company}}) score just hit {{lead.score}}. Act now!" } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "ACCOUNT_MANAGER"],
    category: "Sales",
  },
  {
    name: "Proposal Auto-Send",
    description: "Proposal approved → email to client + log in CRM",
    trigger: { type: "lead_stage_changed", config: { newStage: "PROPOSAL_APPROVED" } },
    conditions: [],
    actions: [
      { type: "send_email", config: { to: "{{lead.email}}", subject: "Your proposal from {{org.name}}", body: "Dear {{lead.name}}, please find your approved proposal attached." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "ACCOUNT_MANAGER"],
    category: "Sales",
  },
  // HR
  {
    name: "Birthday Wish",
    description: "Employee DOB = today → WhatsApp greeting",
    trigger: { type: "schedule", config: { cron: "0 9 * * *", label: "Daily at 9am" } },
    conditions: [{ field: "employee.dobIsToday", operator: "eq", value: true }],
    actions: [
      { type: "send_whatsapp", config: { to: "{{employee.phone}}", message: "🎂 Happy Birthday, {{employee.name}}! Wishing you a wonderful day from the entire team!" } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "HR"],
    category: "HR",
  },
  {
    name: "Probation Reminder",
    description: "30 days before probation ends → create review task for HR",
    trigger: { type: "schedule", config: { cron: "0 9 * * *", label: "Daily at 9am" } },
    conditions: [{ field: "employee.daysUntilProbationEnd", operator: "eq", value: 30 }],
    actions: [
      { type: "create_task", config: { title: "Probation review — {{employee.name}}", priority: "P1", dueDaysFromNow: 7 } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "HR"],
    category: "HR",
  },
  {
    name: "Attendance Alert",
    description: "Employee hasn't logged in by 10am → WhatsApp nudge",
    trigger: { type: "schedule", config: { cron: "0 10 * * 1-5", label: "Weekdays at 10am" } },
    conditions: [{ field: "employee.loggedInToday", operator: "eq", value: false }],
    actions: [
      { type: "send_whatsapp", config: { to: "{{employee.phone}}", message: "Hey {{employee.name}}, you haven't logged into TaskBoard yet today. Please check in when you're free." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "HR", "DEPARTMENT_HEAD"],
    category: "HR",
  },
  // Finance
  {
    name: "Invoice Due Reminder",
    description: "Invoice due in 3 days → WhatsApp to client contact",
    trigger: { type: "schedule", config: { cron: "0 9 * * *", label: "Daily at 9am" } },
    conditions: [{ field: "invoice.daysUntilDue", operator: "eq", value: 3 }],
    actions: [
      { type: "send_whatsapp", config: { to: "{{client.phone}}", message: "Reminder: Invoice #{{invoice.number}} for {{invoice.amount}} is due in 3 days." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "FINANCE", "DEPARTMENT_HEAD"],
    category: "Finance",
  },
  {
    name: "Overdue Invoice Alert",
    description: "Invoice overdue >7 days → notify finance head",
    trigger: { type: "schedule", config: { cron: "0 9 * * *", label: "Daily at 9am" } },
    conditions: [{ field: "invoice.daysOverdue", operator: "gt", value: 7 }],
    actions: [
      { type: "send_whatsapp", config: { to: "finance_head", message: "Overdue invoice: #{{invoice.number}} from {{client.name}} is {{invoice.daysOverdue}} days overdue." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "FINANCE"],
    category: "Finance",
  },
  {
    name: "Monthly P&L Task",
    description: "1st of month → create 'Generate P&L' task for finance",
    trigger: { type: "schedule", config: { cron: "0 9 1 * *", label: "1st of every month" } },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "Generate monthly P&L report", priority: "P1", dueDaysFromNow: 5 } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "FINANCE"],
    category: "Finance",
  },
  // Operations / Projects
  {
    name: "Milestone Due Alert",
    description: "Milestone due in 2 days → WhatsApp to project lead",
    trigger: { type: "schedule", config: { cron: "0 9 * * *", label: "Daily at 9am" } },
    conditions: [{ field: "milestone.daysUntilDue", operator: "eq", value: 2 }],
    actions: [
      { type: "send_whatsapp", config: { to: "project_lead", message: "Milestone '{{milestone.name}}' on {{project.name}} is due in 2 days." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"],
    category: "Operations",
  },
  {
    name: "Weekly Project Report",
    description: "Every Friday 5pm → AI generates project status → sends to client",
    trigger: { type: "schedule", config: { cron: "0 17 * * 5", label: "Every Friday 5pm" } },
    conditions: [],
    actions: [
      { type: "call_ai", config: { prompt: "Generate a concise weekly project status report covering progress, blockers, and next steps." } },
      { type: "send_email", config: { to: "{{client.email}}", subject: "Weekly project update — {{project.name}}", body: "{{ai.result}}" } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"],
    category: "Operations",
  },
  // Personal
  {
    name: "My Task Due Reminder",
    description: "My task due tomorrow → WhatsApp to self",
    trigger: { type: "schedule", config: { cron: "0 18 * * *", label: "Daily at 6pm" } },
    conditions: [{ field: "task.daysUntilDue", operator: "eq", value: 1 }, { field: "task.assigneeId", operator: "eq", value: "{{me.id}}" }],
    actions: [
      { type: "send_whatsapp", config: { to: "self", message: "Heads up: '{{task.title}}' is due tomorrow!" } },
    ],
    scope: "personal",
    roles: [],
    category: "Personal",
  },
  {
    name: "End-of-Day Standup Reminder",
    description: "5:30pm → WhatsApp reminder to fill standup",
    trigger: { type: "schedule", config: { cron: "30 17 * * 1-5", label: "Weekdays at 5:30pm" } },
    conditions: [],
    actions: [
      { type: "send_whatsapp", config: { to: "self", message: "Don't forget to fill in your daily standup before EOD!" } },
    ],
    scope: "personal",
    roles: [],
    category: "Personal",
  },
  {
    name: "Quick Task from WhatsApp",
    description: "Webhook receives message → creates task",
    trigger: { type: "webhook", config: { description: "POST from WhatsApp / Zapier → creates a task" } },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "{{webhook.body.text}}", priority: "P2" } },
    ],
    scope: "personal",
    roles: [],
    category: "Personal",
  },
  // Development
  {
    name: "Bug Fix SLA Reminder",
    description: "Bug fix task open > 24h → WhatsApp reminder to assignee",
    trigger: { type: "schedule", config: { cron: "0 11 * * *", label: "Daily at 11am" } },
    conditions: [
      { field: "task.category", operator: "eq", value: "BUG_FIX" },
      { field: "task.hoursOpen", operator: "gt", value: 24 },
    ],
    actions: [
      { type: "send_whatsapp", config: { to: "assignee", message: "Bug fix '{{task.title}}' has been open over 24h — please update status or flag a blocker." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"],
    category: "Development",
  },
  {
    name: "Daily Standing PR Queue Check",
    description: "9am weekdays → reminder to clear the code review queue",
    trigger: { type: "schedule", config: { cron: "0 9 * * 1-5", label: "Weekdays at 9am" } },
    conditions: [],
    actions: [
      { type: "send_whatsapp", config: { to: "self", message: "Start of day: check the PR review queue before picking up new work." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"],
    category: "Development",
  },
  // Design
  {
    name: "Revision Round Limit Alert",
    description: "A deliverable hits 2+ revision rounds → flag to team lead",
    trigger: { type: "task_created", config: {} },
    conditions: [
      { field: "task.category", operator: "eq", value: "DESIGN" },
      { field: "task.revisionCount", operator: "gt", value: 1 },
    ],
    actions: [
      { type: "send_whatsapp", config: { to: "dept_heads", message: "'{{task.title}}' has gone past 2 revision rounds — may need a client alignment call." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"],
    category: "Design",
  },
  {
    name: "Daily Deliverables Reminder",
    description: "9am → reminder of today's deliverable floor",
    trigger: { type: "schedule", config: { cron: "0 9 * * 1-5", label: "Weekdays at 9am" } },
    conditions: [],
    actions: [
      { type: "send_whatsapp", config: { to: "self", message: "Reminder: keep today's deliverables moving — check your queue before new requests come in." } },
    ],
    scope: "department",
    roles: ["SUPER_ADMIN", "DEPARTMENT_HEAD", "TEAM_LEAD"],
    category: "Design",
  },
];

// A functional-domain category only makes sense for the department it
// belongs to (plus org-wide overseers) — otherwise a Sales employee sees
// Finance/HR automation templates they can never use, and vice versa. This
// is the exact "not for other dept's roles" boundary every other surface in
// the app already respects.
const CATEGORY_DEPARTMENT: Record<string, string | null> = {
  Leadership: null, // role check alone (SUPER_ADMIN/DEPARTMENT_HEAD) already scopes this correctly
  Sales: "sales",
  HR: "hr",
  Finance: "finance",
  Development: "dev",
  Design: "design",
  Operations: null, // cross-functional by nature (project/task ops for any team lead)
  Personal: null, // always visible — self-only automations
};

const CATEGORIES = ["All", "Leadership", "Sales", "Development", "Design", "HR", "Finance", "Operations", "Personal"];

const TRIGGER_OPTIONS = [
  { value: "task_created", label: "Task Created" },
  { value: "lead_stage_changed", label: "Lead Stage Changed" },
  { value: "project_created", label: "Project Created" },
  { value: "schedule", label: "Schedule (cron)" },
  { value: "manual", label: "Manual" },
  { value: "webhook", label: "Webhook" },
];

const ACTION_OPTIONS = [
  { value: "send_whatsapp", label: "Send WhatsApp" },
  { value: "create_task", label: "Create Task" },
  { value: "assign_task", label: "Assign Task" },
  { value: "call_ai", label: "Call AI (the AI gateway)" },
  { value: "update_field", label: "Update Field" },
  { value: "webhook", label: "Webhook (POST)" },
  { value: "send_email", label: "Send Email (not configured yet)" },
];

// Required config keys per action type — checked before save so an automation
// can never be saved in a state that's guaranteed to fail the moment it runs.
const REQUIRED_CONFIG_KEYS: Record<string, string[]> = {
  send_whatsapp: ["to", "message"],
  create_task: ["title"],
  assign_task: ["taskId", "assigneeId"],
  call_ai: ["prompt"],
  update_field: ["entity", "entityId", "field"],
  webhook: ["url"],
  send_email: [], // intentionally always "incomplete" — see label above
};

const SCOPE_ICONS: Record<string, React.ReactNode> = {
  personal: <User className="w-3 h-3" />,
  department: <Users className="w-3 h-3" />,
  global: <Globe className="w-3 h-3" />,
};

// ─── Builder state ──────────────────────────────────────────────────────────

const emptyBuilder = () => ({
  name: "",
  description: "",
  trigger: { type: "manual", config: {} },
  conditions: [] as any[],
  actions: [{ type: "send_whatsapp", config: { to: "", message: "" } }] as any[],
  scope: "personal" as "personal" | "department" | "global",
  roleRestrict: [] as string[],
});

// ─── Main component ──────────────────────────────────────────────────────────

export function AutomationsHub({
  currentRole,
  currentDeptSlug,
}: {
  currentRole?: string;
  currentDeptSlug?: string | null;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [builder, setBuilder] = useState(emptyBuilder());
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const live = useLiveVersion();
  useEffect(() => {
    fetch("/api/automations")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setAutomations(d.automations); })
      .finally(() => setLoading(false));
  }, [live]);

  const isOrgWideOverseer = currentRole === "SUPER_ADMIN" || currentRole === "HR";
  const eligibleTemplates = TEMPLATES.filter((t) => {
    if (t.roles.length > 0 && !t.roles.includes(currentRole ?? "")) return false;
    const requiredDept = CATEGORY_DEPARTMENT[t.category];
    if (requiredDept && !isOrgWideOverseer && currentDeptSlug !== requiredDept) return false;
    return true;
  });
  const filtered = eligibleTemplates.filter(
    (t) => selectedCategory === "All" || t.category === selectedCategory
  );

  function applyTemplate(t: AutomationTemplate) {
    setBuilder({
      name: t.name,
      description: t.description,
      trigger: t.trigger,
      conditions: t.conditions,
      actions: t.actions,
      scope: t.scope,
      roleRestrict: t.roles,
    });
  }

  function firstIncompleteAction(): string | null {
    for (const action of builder.actions) {
      if (action.type === "send_email") {
        return "Send Email isn't wired up yet (no SMTP configured) — pick a different action.";
      }
      const required = REQUIRED_CONFIG_KEYS[action.type] ?? [];
      const missing = required.filter((k) => !String(action.config?.[k] ?? "").trim());
      if (missing.length > 0) {
        const label = ACTION_OPTIONS.find((o) => o.value === action.type)?.label ?? action.type;
        return `${label}: fill in ${missing.join(", ")} before saving`;
      }
    }
    if (builder.trigger.type === "schedule" && !String((builder.trigger.config as any)?.cron ?? "").trim()) {
      return "Schedule trigger needs a cron expression";
    }
    return null;
  }

  async function handleSave() {
    if (!builder.name.trim()) { showToast("Name is required", false); return; }
    const incomplete = firstIncompleteAction();
    if (incomplete) { showToast(incomplete, false); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(builder),
      });
      const data = await res.json();
      if (data.ok) {
        setAutomations((prev) => [data.automation, ...prev]);
        setBuilder(emptyBuilder());
        showToast("Automation created and activated");
      } else {
        showToast(data.error ?? "Failed to save", false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: Automation) {
    const res = await fetch("/api/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, isActive: !a.isActive }),
    });
    const data = await res.json();
    if (data.ok) {
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, isActive: !x.isActive } : x));
    }
  }

  async function runNow(a: Automation) {
    setRunningId(a.id);
    try {
      const res = await fetch(`/api/automations/${a.id}/run`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const succeeded = data.status === "success";
        showToast(`Run ${data.status}${succeeded ? "" : " — check the action config"}`, succeeded);
        setAutomations((prev) =>
          prev.map((x) => x.id === a.id ? { ...x, runCount: x.runCount + 1, lastRunAt: new Date().toISOString() } : x)
        );
      } else {
        showToast(data.error ?? "Run failed", false);
      }
    } finally {
      setRunningId(null);
    }
  }

  async function deleteAutomation(id: string) {
    if (!confirm("Delete this automation?")) return;
    const res = await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setAutomations((prev) => prev.filter((x) => x.id !== id));
      showToast("Deleted");
    } else {
      showToast(data.error ?? "Failed", false);
    }
  }

  function addAction() {
    setBuilder((b) => ({
      ...b,
      actions: [...b.actions, { type: "send_whatsapp", config: {} }],
    }));
  }

  function removeAction(i: number) {
    setBuilder((b) => ({ ...b, actions: b.actions.filter((_, idx) => idx !== i) }));
  }

  function updateAction(i: number, field: string, value: any) {
    setBuilder((b) => {
      const actions = [...b.actions];
      actions[i] = { ...actions[i], [field]: value };
      return { ...b, actions };
    });
  }

  return (
    <div className="flex h-full min-h-0 bg-surface">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-popover border ${
            toast.ok
              ? "bg-teal/10 border-teal/30 text-tealhi"
              : "bg-crimson/10 border-crimson/30 text-crimson"
          }`}
        >
          {toast.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Left: Template library ── */}
      <div className="w-72 shrink-0 border-r border-edge flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-edge">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-tealhi" />
            <span className="font-semibold text-ink text-sm">Template Library</span>
          </div>
          <p className="text-xs text-muted">Click a template to pre-fill the builder</p>
        </div>

        {/* Category filter — only categories with at least one template this
            viewer can actually use; a "Finance" tab that always shows zero
            results to a Sales employee is clutter, not a real option. */}
        <div className="flex flex-wrap gap-1 p-3 border-b border-edge">
          {CATEGORIES.filter(
            (cat) => cat === "All" || eligibleTemplates.some((t) => t.category === cat)
          ).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-teal/20 text-tealhi border border-teal/30"
                  : "text-muted hover:text-ink hover:bg-surface-hover"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto divide-y divide-edge">
          {filtered.map((t, i) => (
            <button
              key={i}
              onClick={() => applyTemplate(t)}
              className="w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate group-hover:text-tealhi transition-colors">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed line-clamp-2">
                    {t.description}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="flex items-center gap-0.5 text-[10px] text-muted">
                      {SCOPE_ICONS[t.scope]} {t.scope}
                    </span>
                    <span className="text-[10px] text-muted">·</span>
                    <span className="text-[10px] text-muted">{t.actions.length} action{t.actions.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-tealhi shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Center: Builder + My Automations ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Builder */}
        <div className="border-b border-edge p-5 shrink-0">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-tealhi" />
            Automation Builder
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-muted mb-1 font-medium">Name</label>
              <input
                value={builder.name}
                onChange={(e) => setBuilder((b) => ({ ...b, name: e.target.value }))}
                className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                placeholder="My automation"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1 font-medium">Description</label>
              <input
                value={builder.description}
                onChange={(e) => setBuilder((b) => ({ ...b, description: e.target.value }))}
                className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                placeholder="What does this do?"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-muted mb-1 font-medium">Trigger</label>
              <select
                value={builder.trigger.type}
                onChange={(e) => setBuilder((b) => ({ ...b, trigger: { type: e.target.value, config: {} } }))}
                className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-teal/50"
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {builder.trigger.type === "schedule" && (
                <input
                  className="mt-1.5 w-full bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                  placeholder="Cron expression e.g. 0 9 * * 1"
                  value={(builder.trigger.config as any).cron ?? ""}
                  onChange={(e) => setBuilder((b) => ({
                    ...b,
                    trigger: { ...b.trigger, config: { ...b.trigger.config, cron: e.target.value } }
                  }))}
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-muted mb-1 font-medium">Scope</label>
              <select
                value={builder.scope}
                onChange={(e) => setBuilder((b) => ({ ...b, scope: e.target.value as any }))}
                className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-teal/50"
              >
                <option value="personal">Personal — only me</option>
                <option value="department">Department — dept head+</option>
                <option value="global">Global — admins only</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted font-medium">Actions</label>
              <button
                onClick={addAction}
                className="text-xs text-tealhi hover:text-tealhi flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add action
              </button>
            </div>
            <div className="space-y-2">
              {builder.actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={action.type}
                    onChange={(e) => updateAction(i, "type", e.target.value)}
                    className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-teal/50"
                  >
                    {ACTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {action.type === "send_whatsapp" && (
                    <div className="flex-1 flex gap-2">
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="To (self / dept_head / phone)"
                        value={action.config?.to ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, to: e.target.value })}
                      />
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="Message"
                        value={action.config?.message ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, message: e.target.value })}
                      />
                    </div>
                  )}
                  {action.type === "create_task" && (
                    <input
                      className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                      placeholder="Task title"
                      value={action.config?.title ?? ""}
                      onChange={(e) => updateAction(i, "config", { ...action.config, title: e.target.value })}
                    />
                  )}
                  {action.type === "assign_task" && (
                    <div className="flex-1 flex gap-2">
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="Task ID"
                        value={action.config?.taskId ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, taskId: e.target.value })}
                      />
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="Assignee employee ID"
                        value={action.config?.assigneeId ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, assigneeId: e.target.value })}
                      />
                    </div>
                  )}
                  {action.type === "call_ai" && (
                    <input
                      className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                      placeholder="Prompt for the AI"
                      value={action.config?.prompt ?? ""}
                      onChange={(e) => updateAction(i, "config", { ...action.config, prompt: e.target.value })}
                    />
                  )}
                  {action.type === "update_field" && (
                    <div className="flex-1 flex gap-2">
                      <select
                        className="bg-raised border border-edge rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-teal/50"
                        value={action.config?.entity ?? "task"}
                        onChange={(e) => updateAction(i, "config", { ...action.config, entity: e.target.value })}
                      >
                        <option value="task">Task</option>
                        <option value="lead">Lead</option>
                      </select>
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="Entity ID"
                        value={action.config?.entityId ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, entityId: e.target.value })}
                      />
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="Field name"
                        value={action.config?.field ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, field: e.target.value })}
                      />
                      <input
                        className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                        placeholder="New value"
                        value={action.config?.value ?? ""}
                        onChange={(e) => updateAction(i, "config", { ...action.config, value: e.target.value })}
                      />
                    </div>
                  )}
                  {action.type === "webhook" && (
                    <input
                      className="flex-1 bg-raised border border-edge rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-teal/50"
                      placeholder="Webhook URL"
                      value={action.config?.url ?? ""}
                      onChange={(e) => updateAction(i, "config", { ...action.config, url: e.target.value })}
                    />
                  )}
                  {action.type === "send_email" && (
                    <span className="flex-1 text-xs text-amber/80 px-3 py-1.5">
                      Not available yet — no email provider is configured.
                    </span>
                  )}
                  {builder.actions.length > 1 && (
                    <button
                      onClick={() => removeAction(i)}
                      className="text-muted hover:text-crimson transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-teal hover:bg-tealhi disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save & Activate"}
          </button>
        </div>

        {/* My Automations list */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-ink mb-3">
            My Automations
            <span className="ml-2 text-xs font-normal text-muted">({automations.length})</span>
          </h3>

          {loading && (
            <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
              <Clock className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}

          {!loading && automations.length === 0 && (
            <div className="text-center py-12 text-muted">
              <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No automations yet.</p>
              <p className="text-xs mt-1">Pick a template or build one above.</p>
            </div>
          )}

          <div className="space-y-2">
            {automations.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-xl border border-edge bg-raised hover:border-teal/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink truncate">{a.name}</span>
                    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md border ${
                      a.isActive
                        ? "bg-teal/10 border-teal/30 text-tealhi"
                        : "bg-surface border-edge text-muted"
                    }`}>
                      {SCOPE_ICONS[a.scope]} {a.scope}
                    </span>
                    <span className="text-[10px] text-muted bg-surface border border-edge px-1.5 py-0.5 rounded-md">
                      {(a.trigger as any).type}
                    </span>
                  </div>
                  {a.description && (
                    <p className="text-xs text-muted mt-0.5 truncate">{a.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
                    <span>{a.actions?.length ?? 0} action{(a.actions?.length ?? 0) !== 1 ? "s" : ""}</span>
                    <span>Runs: {a.runCount}</span>
                    {a.lastRunAt && (
                      <span>Last: {new Date(a.lastRunAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => runNow(a)}
                    disabled={!a.isActive || runningId === a.id}
                    title="Run now"
                    className="p-1.5 rounded-lg border border-edge text-muted hover:text-tealhi hover:border-teal/30 disabled:opacity-40 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleActive(a)}
                    title={a.isActive ? "Deactivate" : "Activate"}
                    className="p-1.5 rounded-lg border border-edge text-muted hover:text-tealhi hover:border-teal/30 transition-colors"
                  >
                    {a.isActive ? <ToggleRight className="w-3.5 h-3.5 text-tealhi" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => deleteAutomation(a.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg border border-edge text-muted hover:text-crimson hover:border-crimson/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
