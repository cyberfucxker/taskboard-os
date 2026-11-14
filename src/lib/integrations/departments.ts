/**
 * Per-department integration curation.
 *
 * The point is adoption, not completeness: a designer should open their
 * integrations page and see three things that matter to them, not nine that
 * do not. Everyone keeps access to everything via `showAll`; this only
 * decides what is *featured*.
 *
 * `priority` drives ordering. Anything <= 200 is "recommended" and is the
 * short list. Admins can override provider/priority/headline in the database
 * (DepartmentIntegration) without a deploy — code here is only the default.
 */

export interface DepartmentIntegrationEntry {
  provider: string;
  priority: number;
  headline: string;
  whyItMatters: string;
}

const CATALOGUE: Record<string, DepartmentIntegrationEntry[]> = {
  dev: [
    {
      provider: "github",
      priority: 10,
      headline: "Every commit becomes TaskBoard activity",
      whyItMatters:
        "See which developer actually worked on which project, on what day, and exactly what changed — without asking anyone.",
    },
    {
      provider: "slack",
      priority: 20,
      headline: "Build updates where the team already talks",
      whyItMatters:
        "PRs, blockers and deploy notices post to your channel, so nothing waits on someone remembering to update TaskBoard.",
    },
    {
      provider: "google",
      priority: 30,
      headline: "Calendar, Drive and Docs in one place",
      whyItMatters:
        "Meetings block your working hours, specs live next to the code, and briefs attach to the task they belong to.",
    },
    {
      provider: "zoom",
      priority: 40,
      headline: "Calls turn into notes automatically",
      whyItMatters: "Demo and standup recordings become a searchable summary attached to the project.",
    },
  ],

  dm: [
    {
      provider: "google",
      priority: 10,
      headline: "Search Console, Analytics, Docs and Sheets",
      whyItMatters:
        "Rankings, traffic and reporting live beside the tasks that produced them, so a performance question gets a real answer.",
    },
    {
      provider: "slack",
      priority: 20,
      headline: "Client-ready reporting without the scramble",
      whyItMatters:
        "Generate the weekly performance summary and post it where the client already reads it.",
    },
    {
      provider: "meta",
      priority: 30,
      headline: "Ad spend tied to leads",
      whyItMatters: "See which campaign actually produced revenue, not just clicks.",
    },
    {
      provider: "github",
      priority: 40,
      headline: "Landing pages and site fixes",
      whyItMatters: "Know exactly which dev change moved which client's rankings.",
    },
  ],

  sales: [
    {
      provider: "google",
      priority: 10,
      headline: "Calendar and Gmail",
      whyItMatters:
        "Book client calls without double-booking, and turn an important email into a task before you forget it.",
    },
    {
      provider: "zoom",
      priority: 20,
      headline: "Every call becomes a meeting record",
      whyItMatters: "Discovery calls produce a summary and next steps automatically.",
    },
    {
      provider: "whatsapp",
      priority: 30,
      headline: "Talk to leads where they are",
      whyItMatters: "Follow-ups go out on WhatsApp and land back on the lead as activity.",
    },
    {
      provider: "slack",
      priority: 40,
      headline: "Pipeline alerts",
      whyItMatters: "New lead or stalled deal raises a flag instead of being noticed a week later.",
    },
  ],

  design: [
    {
      provider: "google",
      priority: 10,
      headline: "Drive, Docs and Slides",
      whyItMatters: "Mockups, brand docs and decks attach to the project they serve.",
    },
    {
      provider: "figma",
      priority: 20,
      headline: "Design files on the right task",
      whyItMatters: "Version history shows who changed what and when, per project.",
    },
    {
      provider: "slack",
      priority: 30,
      headline: "Share for review in single click",
      whyItMatters: "Send a design straight into the channel and keep the feedback with it.",
    },
  ],

  hr: [
    {
      provider: "google",
      priority: 10,
      headline: "Calendar and leave visibility",
      whyItMatters: "See real availability and shift coverage without a spreadsheet.",
    },
    {
      provider: "slack",
      priority: 20,
      headline: "Onboarding checklists that announce themselves",
      whyItMatters: "New joiners see what is due without chasing HR.",
    },
  ],

  finance: [
    {
      provider: "google",
      priority: 10,
      headline: "Sheets and Drive",
      whyItMatters: "Invoices, budgets and statements sit next to the client they belong to.",
    },
    {
      provider: "slack",
      priority: 20,
      headline: "Approval requests in context",
      whyItMatters: "Spend approvals arrive with the project and deadline attached.",
    },
  ],

  leadership: [
    {
      provider: "google",
      priority: 10,
      headline: "The whole company in one account view",
      whyItMatters: "Calendar and reporting surfaces across every department.",
    },
    {
      provider: "slack",
      priority: 20,
      headline: "Company-wide announcements",
      whyItMatters: "Broadcast without managing per-person access.",
    },
    {
      provider: "github",
      priority: 30,
      headline: "Engineering output",
      whyItMatters: "Commit and PR activity per project, per developer, per week.",
    },
    {
      provider: "zoom",
      priority: 40,
      headline: "Leadership calls summarised",
      whyItMatters: "Weekly reviews arrive as notes rather than recordings nobody opens.",
    },
  ],
};

export function departmentCatalogue(slug: string | null | undefined): DepartmentIntegrationEntry[] {
  if (!slug) return CATALOGUE.leadership ?? [];
  return CATALOGUE[slug] ?? [];
}
