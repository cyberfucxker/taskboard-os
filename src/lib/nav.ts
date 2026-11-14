/** Module manifest — single source of truth for shell nav + command palette. */

export const MODULES = [
  "Home",
  "Today",
  "Calendar",
  "Control",
  "Settings",
  "Lock",
  "Tasks",
  "My Work",
  "CRM",
  "Directory",
  "Projects",
  "Clients",
  "HRMS",
  "Finance",
  "AI",
  "Access",
  "LMS",
  "Time",
  "Automations",
  "Monitoring",
  "Overview",
  "Workspace",
  "Updates",
] as const;

export type ModuleSlug = (typeof MODULES)[number];

export interface ModuleMeta {
  slug: ModuleSlug;
  label: string;
  path: string;
  hint: string;
}

export const ROUTES: ModuleMeta[] = [
  { slug: "Home", label: "Home", path: "/", hint: "Your day — plan, focus, wrap up" },
  { slug: "Today", label: "Today", path: "/today", hint: "Your day — tasks + hours" },
  { slug: "Calendar", label: "Calendar", path: "/calendar", hint: "Global timeline & Google Meet schedules" },
  { slug: "Time", label: "Time", path: "/time", hint: "Your time log" },
  { slug: "Lock", label: "Lock panels", path: "/lock", hint: "Privacy veil for your panels" },
  { slug: "Control", label: "Control", path: "/control", hint: "Leadership control (everyone & everything)" },
  { slug: "Settings", label: "Settings", path: "/settings", hint: "Webhooks, MCP & System Integrations" },
  { slug: "Monitoring", label: "Monitoring", path: "/monitoring", hint: "Workplace activity & screenshots (leadership)" },
  { slug: "Tasks", label: "Tasks", path: "/tasks", hint: "Tasks engine" },
  { slug: "My Work", label: "My Work", path: "/my-work", hint: "Your tasks & focus" },
  { slug: "CRM", label: "CRM", path: "/crm", hint: "Lead pipeline" },
  { slug: "Directory", label: "Directory", path: "/directory", hint: "People" },
  { slug: "Projects", label: "Projects", path: "/projects", hint: "Client projects" },
  { slug: "Clients", label: "Clients", path: "/clients", hint: "Clients & accounts" },
  { slug: "HRMS", label: "HRMS", path: "/hrms", hint: "People ops" },
  { slug: "Finance", label: "Finance", path: "/finance", hint: "Money & contracts" },
  { slug: "AI", label: "AI", path: "/ai", hint: "Agents & automation" },
  { slug: "Automations", label: "Automations", path: "/automations", hint: "Role-based automation builder" },
  { slug: "Access", label: "Access", path: "/access", hint: "Per-employee access control" },
  { slug: "LMS", label: "Learning", path: "/lms", hint: "Training & skill drills" },
];

/**
 * Priority modules pinned at the top of the sidebar regardless of grant order.
 * Everything else an employee can see collapses under "More". CORE set =
 * Today, Calendar, Tasks, Overview (Board), Time, Learning.
 */
export const CORE_SLUGS: ModuleSlug[] = ["Today", "Calendar", "Tasks", "Time", "LMS"];
