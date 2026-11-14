import type { Method } from "./express";

/**
 * Who may call which CRM path — the TaskBoard port of the legacy CRM's `adminGuard` module map.
 *
 * The legacy CRM checked a panel role against a module per path. TaskBoard already has capabilities, so
 * the same decision is made in three tiers:
 *   - "view":   crm.view — every read.
 *   - "manage": crm.view + crm.manage — every write that works leads (create, assign, notes,
 *               follow-ups, calls, bulk actions, enrolling a lead with an AI SDR agent).
 *   - "admin":  crm.view (+ crm.manage for writes) AND a full-access role (SUPER_ADMIN or
 *               DEPARTMENT_HEAD) — the screens that configure the CRM itself: lead sources,
 *               credentials, pipelines, automations, forms, custom fields.
 * plus "public" for the handful of URLs a third party or an anonymous visitor calls.
 *
 * Kept free of imports beyond a type so it can be unit-tested without a database or a session.
 * Like the legacy CRM's guard, it fails closed: a path under no known mount is not reachable at all.
 */
export type Access = "public" | "view" | "manage" | "admin";

/** Paths that must work with no session: webhooks, unsubscribe links, the public form pages. */
export const PUBLIC_PATTERNS: RegExp[] = [/^\/webhook(\/|$)/, /^\/unsubscribe(\/|$)/, /^\/forms\/public(\/|$)/];

interface AdminRule {
  pattern: RegExp;
  /** Which methods the rule covers; "write" means every method except GET. */
  methods: "any" | "write" | Method[];
  /** Carve-outs inside the rule that stay at the ordinary tier. */
  except?: { method: Method; pattern: RegExp }[];
}

/**
 * The configuration surface. Anything matching a rule needs a full-access role, on top of the
 * capability the method already requires.
 */
export const ADMIN_RULES: AdminRule[] = [
  // Lead-source connections hold Meta tokens and webhook credentials — even reading them is admin.
  { pattern: /^\/connections(\/|$)/, methods: "any" },
  { pattern: /^\/settings(\/|$)/, methods: "write" },
  // Provider API keys, sender identity, suppression list.
  { pattern: /^\/email-settings(\/|$)/, methods: "any" },
  // Telephony provider token, webhook URLs, routing rules.
  { pattern: /^\/calls\/settings(\/|$)/, methods: "any" },
  // Mapping an extension to an employee re-attributes that employee's call history.
  { pattern: /^\/calls\/extensions(\/|$)/, methods: ["PATCH"] },
  // WhatsApp Business account credentials. Conversations stay at the ordinary tiers.
  { pattern: /^\/whatsapp\/accounts(\/|$)/, methods: "any" },
  { pattern: /^\/lead-fields(\/|$)/, methods: "write" },
  // Creating / renaming / deleting whole pipelines is admin.
  // Stage CRUD within an existing pipeline is allowed at the manage tier so the sales team
  // can maintain their own stages without needing a department-head account.
  {
    pattern: /^\/pipelines(\/|$)/,
    methods: "write",
    except: [
      { method: "POST", pattern: /^\/pipelines\/[^/]+\/stages\/?$/ },
      { method: "POST", pattern: /^\/pipelines\/[^/]+\/stages\/reorder\/?$/ },
      { method: "PATCH", pattern: /^\/pipelines\/stages\/[^/]+\/?$/ },
      { method: "DELETE", pattern: /^\/pipelines\/stages\/[^/]+\/?$/ },
    ],
  },
  { pattern: /^\/stage-groups(\/|$)/, methods: "write" },
  // Building automations is admin; running a manual automation on your own leads is not.
  {
    pattern: /^\/automations(\/|$)/,
    methods: "write",
    except: [{ method: "POST", pattern: /^\/automations\/[^/]+\/run\/?$/ }],
  },
  // Agent configuration only. Enrolling leads and working an enrollment's thread stay manage.
  { pattern: /^\/sdr-agents\/?$/, methods: ["POST"] },
  { pattern: /^\/sdr-agents\/(?!enrollments(\/|$))[^/]+\/?$/, methods: ["PATCH", "DELETE"] },
  { pattern: /^\/sdr-agents\/(?!enrollments(\/|$))[^/]+\/toggle\/?$/, methods: ["POST"] },
  // Forms are published to the public site; submissions are read at the ordinary tier.
  { pattern: /^\/forms(\/|$)/, methods: "write" },
];

function ruleApplies(rule: AdminRule, method: Method, path: string): boolean {
  if (!rule.pattern.test(path)) return false;
  const methodMatches =
    rule.methods === "any" ? true : rule.methods === "write" ? method !== "GET" : rule.methods.includes(method);
  if (!methodMatches) return false;
  return !(rule.except ?? []).some((e) => e.method === method && e.pattern.test(path));
}

/** The tier a request needs. `path` is relative to /api/crm, e.g. `/leads/abc/notes`. */
export function requiredAccess(method: Method, path: string): Access {
  if (PUBLIC_PATTERNS.some((p) => p.test(path))) return "public";
  if (ADMIN_RULES.some((rule) => ruleApplies(rule, method, path))) return "admin";
  return method === "GET" ? "view" : "manage";
}
