/**
 * Integration provider registry.
 *
 * THE POINT OF THIS FILE
 * Adding a tool to TaskBoard should be a configuration change, not a code change.
 * Every provider is declared here once — how to authenticate it, which
 * least-privilege scope bundles it offers, which secrets the org admin must
 * supply, and which product capabilities it unlocks. The admin console, the
 * employee "Connect your tools" screen, the OAuth engine and the feature
 * gating all read from this one list, so they can never drift apart.
 *
 * SCOPE PHILOSOPHY
 * Scopes are bundled by PURPOSE and labelled with what they allow, instead of
 * asking an employee to pick from a wall of URLs. The admin enables bundles
 * org-wide; the employee just clicks "Connect" and consents once. Read-only
 * bundles are kept separate from write bundles so the default posture for a new
 * install is read-only, and enabling a write bundle is a visible decision.
 *
 * `status` is honest on purpose:
 *   - "ready"        every required secret can be supplied and the flow is implemented
 *   - "needs_config" the flow exists but the org must register an OAuth app first
 *   - "planned"      declared so the UI and roadmap are complete, not yet wired
 * Nothing is listed here that the app cannot actually do something with.
 */

export type AuthKind = "oauth2" | "manual" | "service_account" | "webhook";
export type Connection = "per_employee" | "org_wide" | "none";
export type ProviderStatus = "ready" | "needs_config" | "planned";
export type Risk = "read" | "write";

export interface ScopeBundle {
  id: string;
  label: string;
  description: string;
  risk: Risk;
  scopes: string[];
  /**
   * A prerequisite for establishing the connection at all (e.g. reading the
   * account email), not a product capability. Prerequisites are requested
   * implicitly and never appear in `capabilitiesForBundles`, because a feature
   * must never be gated on something every connection satisfies by definition.
   */
  prerequisite?: boolean;
}

export interface RequiredConfig {
  key: string;
  label: string;
  secret: boolean;
  /**
   * Optional entries are advisory only: a missing value never stops a
   * connection. Use them for settings that refine behaviour (e.g. a Workspace
   * domain restriction) rather than credentials the handshake cannot start
   * without.
   */
  optional?: boolean;
  help?: string;
}

export interface ProviderDef {
  /** Stable key. Must match `EmployeeIntegration.provider`. */
  key: string;
  name: string;
  category: string;
  blurb: string;
  auth: AuthKind;
  connection: Connection;
  requiredConfig: RequiredConfig[];
  authUrl?: string;
  tokenUrl?: string;
  /** Bundles enabled when an org first turns this provider on. */
  defaultBundles: string[];
  bundles: ScopeBundle[];
  /** Product capabilities this provider can unlock, e.g. "calendar.read". */
  capabilities: string[];
  status: ProviderStatus;
  /** True when the provider needs a real account/app before any employee benefit. */
  blockedOnOrg?: boolean;
}

const G = "https://www.googleapis.com/auth/";

export const PROVIDERS: ProviderDef[] = [
  {
    key: "google",
    name: "Google Workspace",
    category: "Productivity",
    blurb:
      "Calendar, Drive, Docs, Sheets, Slides, Gmail and Tasks — the core of daily work in TaskBoard.",
    auth: "oauth2",
    connection: "per_employee",
    requiredConfig: [
      {
        key: "GOOGLE_CLIENT_ID",
        label: "OAuth Client ID",
        secret: false,
        help: "From Google Cloud Console → APIs & Services → Credentials.",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        label: "OAuth Client Secret",
        secret: true,
      },
      {
        key: "GOOGLE_WORKSPACE_DOMAIN", optional: true,
        label: "Workspace domain",
        secret: false,
        help: "e.g. example.com. Optional — leave blank to allow personal accounts too.",
      },
    ],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultBundles: ["identify", "calendar.read", "drive.file", "docs", "sheets", "tasks"],
    bundles: [
      {
        id: "identify",
        label: "Confirm who you are",
        prerequisite: true,
        description: "Reads your name, email address and profile photo. Required to connect.",
        risk: "read",
        scopes: ["openid", "email", "profile"],
      },
      {
        id: "calendar.read",
        label: "Calendar — read",
        description: "See your events, meetings and free/busy so TaskBoard can schedule sensibly.",
        risk: "read",
        scopes: [G + "calendar.readonly"],
      },
      {
        id: "calendar.write",
        label: "Calendar — create & edit events",
        description: "Create meetings from tasks, move them, or cancel them.",
        risk: "write",
        scopes: [G + "calendar.events"],
      },
      {
        id: "drive.file",
        label: "Drive — files you choose",
        description:
          "Only files you explicitly pick or create. Recommended over full Drive access.",
        risk: "read",
        scopes: [G + "drive.file"],
      },
      {
        id: "drive.read",
        label: "Drive — read everything",
        description: "Read any file in your Drive, including ones you did not choose.",
        risk: "read",
        scopes: [G + "drive.readonly"],
      },
      {
        id: "docs",
        label: "Google Docs",
        description: "Open, create and edit Google Docs.",
        risk: "write",
        scopes: [G + "documents"],
      },
      {
        id: "sheets",
        label: "Google Sheets",
        description: "Read and write Google Sheets, including exports and reports.",
        risk: "write",
        scopes: [G + "spreadsheets"],
      },
      {
        id: "slides",
        label: "Google Slides",
        description: "Read and edit slide decks.",
        risk: "write",
        scopes: [G + "presentations"],
      },
      {
        id: "gmail.read",
        label: "Gmail — read",
        description: "Read your mail to triage and summarise. Never sends anything.",
        risk: "read",
        scopes: [G + "gmail.readonly"],
      },
      {
        id: "gmail.send",
        label: "Gmail — send",
        description: "Send mail on your behalf. Only enable if a feature needs it.",
        risk: "write",
        scopes: [G + "gmail.send"],
      },
      {
        id: "tasks",
        label: "Google Tasks",
        description: "Mirror your work into Google Tasks.",
        risk: "write",
        scopes: [G + "tasks"],
      },
    ],
    capabilities: [
      "calendar.read",
      "calendar.write",
      "drive.read",
      "drive.write",
      "docs.read",
      "docs.write",
      "sheets.read",
      "sheets.write",
      "slides.write",
      "gmail.read",
      "gmail.send",
      "tasks.sync",
    ],
    status: "ready",
  },

  {
    key: "zoom",
    name: "Zoom",
    category: "Communication",
    blurb: "Create and track meetings from tasks and standups.",
    auth: "oauth2",
    connection: "per_employee",
    requiredConfig: [
      { key: "ZOOM_CLIENT_ID", label: "OAuth Client ID", secret: false },
      { key: "ZOOM_CLIENT_SECRET", label: "OAuth Client Secret", secret: true },
    ],
    authUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    defaultBundles: ["identify", "meetings"],
    bundles: [
      {
        id: "identify",
        label: "Confirm who you are",
        prerequisite: true,
        description: "Reads your Zoom profile email.",
        risk: "read",
        scopes: ["user:read"],
      },
      {
        id: "meetings",
        label: "Create & manage meetings",
        description: "Schedule, update and delete meetings you own.",
        risk: "write",
        scopes: ["meeting:write"],
      },
    ],
    capabilities: ["video.meetings"],
    status: "ready",
  },

  {
    key: "microsoft",
    name: "Microsoft 365",
    category: "Productivity",
    blurb: "Outlook mail and calendar, OneDrive files, and Teams.",
    auth: "oauth2",
    connection: "per_employee",
    requiredConfig: [
      { key: "MS_CLIENT_ID", label: "App (client) ID", secret: false, help: "Azure portal → App registrations." },
      { key: "MS_CLIENT_SECRET", label: "Client secret", secret: true },
      { key: "MS_TENANT_ID", label: "Tenant ID", secret: false, help: "Common for single-tenant orgs." },
    ],
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    defaultBundles: ["identify", "calendar.read", "mail.read"],
    bundles: [
      {
        id: "identify",
        label: "Confirm who you are",
        prerequisite: true,
        description: "Basic profile so TaskBoard knows which account is connected.",
        risk: "read",
        scopes: ["offline_access", "User.Read"],
      },
      {
        id: "calendar.read",
        label: "Outlook calendar — read",
        description: "Read events and free/busy.",
        risk: "read",
        scopes: ["Calendars.Read"],
      },
      {
        id: "calendar.write",
        label: "Outlook calendar — create & edit",
        description: "Create, move and cancel events.",
        risk: "write",
        scopes: ["Calendars.ReadWrite"],
      },
      {
        id: "mail.read",
        label: "Outlook mail — read",
        description: "Read mail to triage. Never sends anything.",
        risk: "read",
        scopes: ["Mail.Read"],
      },
      {
        id: "mail.send",
        label: "Outlook mail — send",
        description: "Send mail on your behalf.",
        risk: "write",
        scopes: ["Mail.Send"],
      },
      {
        id: "onedrive",
        label: "OneDrive",
        description: "Read and write your own OneDrive files.",
        risk: "write",
        scopes: ["Files.ReadWrite"],
      },
    ],
    capabilities: ["calendar.read", "calendar.write", "drive.read", "drive.write", "mail.read", "mail.send"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    key: "slack",
    name: "Slack",
    category: "Communication",
    blurb: "Send task and standup notifications into channels and DMs.",
    auth: "oauth2",
    connection: "org_wide",
    requiredConfig: [
      { key: "SLACK_CLIENT_ID", label: "Client ID", secret: false },
      { key: "SLACK_CLIENT_SECRET", label: "Client Secret", secret: true },
      { key: "SLACK_SIGNING_SECRET", label: "Signing Secret", secret: true, help: "Verifies inbound webhooks." },
    ],
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    defaultBundles: ["post", "read"],
    bundles: [
      {
        id: "post",
        label: "Post messages",
        description: "Send messages to channels the app is in.",
        risk: "write",
        scopes: ["chat:write", "im:write"],
      },
      {
        id: "read",
        label: "Read channels",
        description: "List channels and members so TaskBoard can route notifications.",
        risk: "read",
        scopes: ["channels:read", "users:read", "users:read.email"],
      },
    ],
    capabilities: ["notify.channel", "notify.dm"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    key: "github",
    name: "GitHub",
    category: "Development",
    blurb: "Link commits and pull requests to tasks automatically.",
    auth: "oauth2",
    connection: "org_wide",
    requiredConfig: [
      { key: "GITHUB_CLIENT_ID", label: "OAuth App Client ID", secret: false },
      { key: "GITHUB_CLIENT_SECRET", label: "Client Secret", secret: true },
    ],
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultBundles: ["identify", "commits"],
    bundles: [
      {
        id: "identify",
        label: "Confirm who you are",
        prerequisite: true,
        description: "Reads your public profile and verified emails.",
        risk: "read",
        scopes: ["read:user", "user:email"],
      },
      {
        id: "commits",
        label: "Commits & pull requests",
        description: "Read commit and PR metadata to attach to tasks.",
        risk: "read",
        scopes: ["repo"],
      },
    ],
    capabilities: ["dev.link_commits", "dev.link_prs"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    key: "notion",
    name: "Notion",
    category: "Productivity",
    blurb: "Publish task notes and briefs into Notion pages.",
    auth: "oauth2",
    connection: "per_employee",
    requiredConfig: [
      { key: "NOTION_CLIENT_ID", label: "OAuth Client ID", secret: false },
      { key: "NOTION_CLIENT_SECRET", label: "Client Secret", secret: true },
    ],
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    defaultBundles: ["read", "write"],
    bundles: [
      {
        id: "read",
        label: "Read pages you share",
        description: "Read pages and databases explicitly shared with the integration.",
        risk: "read",
        scopes: ["read_content"],
      },
      {
        id: "write",
        label: "Create and update pages",
        description: "Append and edit content in shared pages.",
        risk: "write",
        scopes: ["insert_content"],
      },
    ],
    capabilities: ["docs.publish"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    key: "whatsapp",
    name: "WhatsApp Business",
    category: "Communication",
    blurb: "Send client and task alerts to a business number.",
    auth: "service_account",
    connection: "org_wide",
    requiredConfig: [
      { key: "WHATSAPP_TOKEN", label: "Permanent Access Token", secret: true },
      { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone Number ID", secret: false },
    ],
    defaultBundles: ["notify"],
    bundles: [
      {
        id: "notify",
        label: "Send notifications",
        description: "Send templated and free-form messages from the business number.",
        risk: "write",
        scopes: [],
      },
    ],
    capabilities: ["notify.whatsapp"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    key: "meta_ads",
    name: "Meta Lead Ads",
    category: "Marketing",
    blurb: "Receive Facebook/Instagram lead form submissions straight into the CRM.",
    auth: "webhook",
    connection: "org_wide",
    requiredConfig: [
      { key: "META_APP_ID", label: "App ID", secret: false, help: "Meta App Dashboard -> Settings -> Basic. Used to start the OAuth page picker." },
      { key: "META_APP_SECRET", label: "App Secret", secret: true, help: "Verifies inbound webhook signatures. Required — without it both Meta webhooks reject every delivery." },
      { key: "META_PAGE_ACCESS_TOKEN", label: "Page Access Token", secret: true, help: "Read token for the subscribed Page. Lead answers are fetched with it." },
      { key: "META_PAGE_ID", label: "Page ID", secret: false, help: "The Page subscribed to the leadgen webhook." },
      { key: "META_VERIFY_TOKEN", label: "Verify Token", secret: true, help: "You choose this; paste the same value into Meta's webhook field." },
      { key: "META_FORM_IDS", label: "Form routing", secret: false, optional: true, help: "Comma-separated formId=employeeId pairs, e.g. 111=emp_a,222=emp_b. Unmatched leads fall to the default rep." },
    ],
    defaultBundles: ["ingest"],
    bundles: [
      {
        id: "ingest",
        label: "Receive leads",
        description: "Accept lead form submissions into the pipeline.",
        risk: "write",
        scopes: [],
      },
    ],
    capabilities: ["crm.lead_ingest"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    key: "telecrm",
    name: "TeleCRM",
    category: "CRM",
    blurb: "Pull existing leads and call history out of TeleCRM into TaskBoard, and keep them in step.",
    auth: "manual",
    connection: "org_wide",
    requiredConfig: [
      { key: "TELECRM_ENTERPRISE_ID", label: "Enterprise ID", secret: false, help: "TeleCRM -> Settings -> API. The numeric id in your account URL." },
      { key: "TELECRM_SYNC_TOKEN", label: "Sync API token", secret: true, help: "Must be a **Sync** token. An Async token is push-only and cannot read leads back." },
      { key: "TELECRM_BASE_URL", label: "Base URL", secret: false, optional: true, help: "Leave blank for the default (next.telecrm.in). Only change it if TeleCRM gave you a different host." },
    ],
    defaultBundles: ["import"],
    bundles: [
      {
        id: "import",
        label: "Import leads",
        description: "Pull leads from TeleCRM into the TaskBoard pipeline.",
        risk: "write",
        scopes: [],
      },
    ],
    capabilities: ["crm.lead_ingest", "crm.lead_sync"],
    status: "needs_config",
    blockedOnOrg: true,
  },

  {
    // No credentials and no consent — every employee can use this immediately.
    key: "ical",
    name: "Read-only calendar feed",
    category: "Productivity",
    blurb:
      "Paste your private Google or Outlook iCal secret link. Read-only, works with no app registration.",
    auth: "manual",
    connection: "per_employee",
    requiredConfig: [],
    defaultBundles: ["feed"],
    bundles: [
      {
        id: "feed",
        label: "Read my calendar",
        description: "TaskBoard can read your events. It cannot change anything.",
        risk: "read",
        scopes: [],
      },
    ],
    capabilities: ["calendar.read"],
    status: "ready",
  },
];

const BY_KEY = new Map(PROVIDERS.map((p) => [p.key, p]));

export function getProvider(key: string): ProviderDef | undefined {
  return BY_KEY.get(String(key).toLowerCase());
}

export function listProviders(): ProviderDef[] {
  return PROVIDERS;
}

/** Providers an org admin can actually switch on today. */
export function configurableProviders(): ProviderDef[] {
  return PROVIDERS.filter((p) => p.status !== "planned");
}

/** Which env secrets are still missing for a provider. */
export function missingConfig(p: ProviderDef): RequiredConfig[] {
  return p.requiredConfig.filter((c) => !c.optional && !process.env[c.key]?.trim());
}

/** Optional settings that are unset — surfaced to admins, but not blockers. */
export function missingOptionalConfig(p: ProviderDef): RequiredConfig[] {
  return p.requiredConfig.filter((c) => c.optional && !process.env[c.key]?.trim());
}

export function isProviderConfigured(p: ProviderDef): boolean {
  return missingConfig(p).length === 0;
}

/** Union of scopes for the given bundles, de-duplicated and order-stable. */
export function scopesForBundles(p: ProviderDef, bundleIds: string[]): string[] {
  const wanted = new Set(bundleIds);
  const out: string[] = [];
  for (const b of p.bundles) {
    if (!wanted.has(b.id)) continue;
    for (const s of b.scopes) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Capabilities implied by a set of enabled bundles — used for feature gating.
 * Prerequisite bundles are excluded: they are always requested and never unlock
 * a feature on their own.
 */
export function capabilitiesForBundles(
  p: ProviderDef,
  bundleIds: string[]
): string[] {
  const wanted = new Set(bundleIds);
  const out = new Set<string>();
  for (const b of p.bundles) {
    if (b.prerequisite) continue;
    if (wanted.has(b.id)) out.add(b.id);
  }
  return [...out];
}

/** Scopes actually sent to the provider: the selected bundles plus any prerequisites. */
export function effectiveScopes(p: ProviderDef, bundleIds: string[]): string[] {
  return scopesForBundles(p, [
    ...bundleIds,
    ...p.bundles.filter((b) => b.prerequisite).map((b) => b.id),
  ]);
}

/** Redirect URIs the provider must be registered with, for the admin console. */
export function redirectUriFor(p: ProviderDef, origin: string): string {
  if (p.auth === "manual") return `${origin}/settings/connections`;
  return `${origin}/api/integrations/${p.key}/callback`;
}
