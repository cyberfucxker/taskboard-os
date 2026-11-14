import type { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { effectiveCapsForSession, type ScopedSession } from "@/lib/scope";
import { createResponse, runHandlers, type Captured, type Method, type RouterImpl } from "./express";
import { requiredAccess } from "./access";
import { prisma } from "./prisma";
import type { AuthedRequest } from "./services/auth";
import { assignableIds, crmAudience, FULL_ACCESS_ROLES, resolveDataScope, type DataScope } from "./services/hierarchy";
import { runWithScope } from "./services/requestContext";
import { ACTIVE_EMPLOYEE_STATUSES } from "./services/callRouting";

import { webhookRouter } from "./routes/webhooks";
import { unsubscribeRouter } from "./routes/unsubscribe";
import { connectionsRouter } from "./routes/connections";
import { leadsRouter } from "./routes/leads";
import { pipelinesRouter, tagsRouter } from "./routes/pipelines";
import { followUpsRouter } from "./routes/followups";
import { automationsRouter } from "./routes/automations";
import { reportsRouter } from "./routes/reports";
import { formsRouter } from "./routes/forms";
import { settingsRouter } from "./routes/settings";
import { aiSdrRouter } from "./routes/aiSdrAgents";
import { callsRouter } from "./routes/calls";
import { emailSettingsRouter } from "./routes/emailSettings";
import { whatsappRouter } from "./routes/whatsapp";
import { leadFieldsRouter } from "./routes/leadFields";
import { stageGroupsRouter } from "./routes/stageGroups";

/**
 * The CRM API dispatcher: /api/crm/<segments> -> the ported the legacy CRM Express routers.
 *
 * Mirrors the CRM section of the legacy CRM's server/src/index.ts — the same mount points, minus
 * the `/api` prefix (TaskBoard mounts the whole thing at /api/crm) and minus the email-sequence and
 * email-template routers, which were not ported. The guard that the legacy CRM ran as `adminGuard`
 * middleware runs here, before any router, so a new route is locked down by default instead of
 * by remembering to (see ./access.ts for the tiers).
 */
export const MOUNTS: [string, RouterImpl][] = [
  ["/webhook", webhookRouter],
  ["/unsubscribe", unsubscribeRouter],
  ["/connections", connectionsRouter],
  ["/leads", leadsRouter],
  ["/pipelines", pipelinesRouter],
  ["/tags", tagsRouter],
  ["/followups", followUpsRouter],
  ["/automations", automationsRouter],
  ["/reports", reportsRouter],
  ["/forms", formsRouter],
  ["/settings", settingsRouter],
  ["/sdr-agents", aiSdrRouter],
  ["/calls", callsRouter],
  ["/email-settings", emailSettingsRouter],
  ["/whatsapp", whatsappRouter],
  ["/lead-fields", leadFieldsRouter],
  ["/stage-groups", stageGroupsRouter],
];

/** Longest mount that is a whole-segment prefix of `path`; the router sees the remainder. */
export function findMount(path: string): { router: RouterImpl; mount: string; rest: string } | null {
  let best: { router: RouterImpl; mount: string; rest: string } | null = null;
  for (const [mount, router] of MOUNTS) {
    if (path !== mount && !path.startsWith(`${mount}/`)) continue;
    if (best && best.mount.length >= mount.length) continue;
    best = { router, mount, rest: path.slice(mount.length) || "/" };
  }
  return best;
}

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// ---------------------------------------------------------------------------
// Web Request -> Express-shaped request
// ---------------------------------------------------------------------------

function parseQuery(params: URLSearchParams): Record<string, string | string[] | undefined> {
  const query: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of params) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return query;
}

class BadRequest extends Error {
  status = 400;
}

/** JSON and urlencoded bodies are parsed (telephony webhooks send urlencoded); anything else is `{}`. */
export function parseBody(raw: Buffer, contentType: string): unknown {
  if (raw.length === 0) return {};
  const type = contentType.toLowerCase();
  if (type.includes("json")) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      throw new BadRequest("The request body is not valid JSON.");
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return parseQuery(new URLSearchParams(raw.toString("utf8")));
  }
  return {};
}

async function toCrmRequest(req: Request, path: string, method: Method): Promise<AuthedRequest> {
  const url = new URL(req.url);
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const rawBody = method === "GET" ? Buffer.alloc(0) : Buffer.from(await req.arrayBuffer());
  const forwarded = headers["x-forwarded-for"]?.split(",")[0]?.trim();

  return {
    method,
    path,
    originalUrl: `${url.pathname}${url.search}`,
    params: {},
    query: parseQuery(url.searchParams),
    body: parseBody(rawBody, headers["content-type"] ?? ""),
    rawBody,
    headers,
    header: (name: string) => headers[name.toLowerCase()],
    ip: forwarded || headers["x-real-ip"] || undefined,
  };
}

// ---------------------------------------------------------------------------
// Captured -> web Response
// ---------------------------------------------------------------------------

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function toWebResponse(out: Captured): Response {
  // A 204/304 may not carry a body, whatever the handler passed.
  if (out.status === 204 || out.status === 304 || out.kind === "empty") {
    return new Response(null, { status: out.status });
  }
  if (out.kind === "redirect") {
    return new Response(null, { status: out.status, headers: { location: out.location ?? "/" } });
  }
  if (out.kind === "json") return json(out.status, out.body ?? null);

  // Text. The unsubscribe route answers with a full HTML page; everything else (the Meta
  // verification challenge, plain error strings) is plain text.
  const body = Buffer.isBuffer(out.body) ? out.body.toString("utf8") : String(out.body ?? "");
  const isHtml = /^\s*<(!doctype|html)/i.test(body);
  return new Response(body, {
    status: out.status,
    headers: { "content-type": `${isHtml ? "text/html" : "text/plain"}; charset=utf-8` },
  });
}

function errorResponse(err: unknown): Response {
  const e = err as { status?: number; statusCode?: number; code?: string; message?: string } | undefined;
  // Prisma's "record not found" and unique-constraint errors carry meaning the UI branches on,
  // exactly as the legacy CRM's Express error handler mapped them.
  if (e?.code === "P2025") return json(404, { error: "Record not found" });
  if (e?.code === "P2002") return json(409, { error: "That value is already in use." });
  // A body naming a field that does not exist, or the wrong type for one, is the caller's error.
  if ((err as Error | undefined)?.name === "PrismaClientValidationError") {
    return json(400, { error: "The request contains a field or value the CRM does not accept." });
  }
  const status = Number(e?.status ?? e?.statusCode);
  if (status >= 400 && status < 500) return json(status, { error: e?.message || "Request failed" });
  console.error("[crm]", err);
  return json(Number.isInteger(status) && status >= 500 && status < 600 ? status : 500, {
    error: e?.message || "Internal server error",
  });
}

// ---------------------------------------------------------------------------
// TaskBoard-native endpoints the CRM screens need (the legacy CRM served these from its own user tables)
// ---------------------------------------------------------------------------

/** Money fields that reports return; nulled for anyone outside Leadership. */
const REVENUE_KEYS = new Set([
  "wonValue", "dealValue", "revenue", "pipelineValue", "totalValue", "avgDealValue", "avgDealSize",
  "expectedRevenue", "weightedValue",
]);

function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = REVENUE_KEYS.has(k) ? null : scrub(val);
  return out;
}

async function stripRevenue(res: Response): Promise<Response> {
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) return res;
  const body = await res.json().catch(() => undefined);
  if (body === undefined) return res;
  return json(res.status, scrub(body));
}

interface Caller {
  session: ScopedSession;
  caps: Set<string>;
  scope: DataScope;
  isFullAccess: boolean;
}

/** Client-portal logins are not staff and never appear as assignees or agents. */
const NON_STAFF_ROLES: Role[] = ["CLIENT_ADMIN", "CLIENT_VIEWER"];

async function activeEmployees(onlyIds: string[] | null) {
  const rows = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { in: [...ACTIVE_EMPLOYEE_STATUSES] },
      role: { notIn: NON_STAFF_ROLES },
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      personalPhone: true,
      department: { select: { slug: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    role: e.role,
    departmentSlug: e.department?.slug ?? null,
    departmentName: e.department?.name ?? null,
    phone: e.personalPhone ?? null,
  }));
}

async function nativeRoute(method: Method, path: string, caller: Caller): Promise<Response | null> {
  if (method !== "GET") return null;
  const p = path.replace(/\/+$/, "") || "/";

  if (p === "/me") {
    const me = await prisma.employee.findUnique({ where: { id: caller.session.user.id }, select: { name: true } });
    return json(200, {
      id: caller.session.user.id,
      name: me?.name ?? caller.session.user.name ?? null,
      role: caller.session.user.role,
      departmentSlug: caller.session.user.departmentSlug ?? null,
      isFullAccess: caller.isFullAccess,
      canManage: caller.caps.has("crm.manage"),
      canAdmin: caller.isFullAccess,
      canSeeRevenue: (await crmAudience(caller.session.user.id)).isLeadership,
    });
  }
  if (p === "/users") return json(200, await activeEmployees(null));
  if (p === "/users/assignable") return json(200, await activeEmployees(assignableIds(caller.scope)));
  if (p === "/teams") {
    const teams = await prisma.team.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        leadId: true,
        employees: {
          where: { deletedAt: null, status: { in: [...ACTIVE_EMPLOYEE_STATUSES] } },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return json(
      200,
      teams.map((t) => ({ id: t.id, name: t.name, leadId: t.leadId, memberIds: t.employees.map((e) => e.id) }))
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

async function runRouter(router: RouterImpl, req: AuthedRequest, method: Method, rest: string): Promise<Response> {
  const matched = router.match(method, rest);
  if (!matched) return json(404, { error: `No CRM route for ${method} ${req.originalUrl}` });
  req.params = matched.params;
  const { res, out } = createResponse();
  await runHandlers(matched.layer.handlers, req, res, out);
  if (!out.done) {
    // Every ported handler answers; one that falls through is a bug, not a success.
    console.error(`[crm] ${method} ${req.originalUrl} produced no response`);
    return json(500, { error: "The CRM handler produced no response." });
  }
  return toWebResponse(out);
}

export async function dispatch(req: Request, segments: string[]): Promise<Response> {
  try {
    const method = req.method.toUpperCase() as Method;
    if (!METHODS.includes(method)) return json(405, { error: `Method ${req.method} is not allowed.` });

    const path = `/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
    const access = requiredAccess(method, path);

    // Public: third-party webhooks, unsubscribe links, the visitor-facing form endpoints. No
    // session, no data scope — these act as the system.
    if (access === "public") {
      const mounted = findMount(path);
      if (!mounted) return json(404, { error: "Not found" });
      const crmReq = await toCrmRequest(req, mounted.rest, method);
      return await runRouter(mounted.router, crmReq, method, mounted.rest);
    }

    const session = (await getSession()) as ScopedSession | null;
    if (!session?.user?.id) return json(401, { error: "Sign in required." });

    const caps = (await effectiveCapsForSession(session)) as Set<string>;
    if (!caps.has("crm.view")) return json(403, { error: "Your access does not include the CRM." });
    if (method !== "GET" && !caps.has("crm.manage")) {
      return json(403, { error: "Your access lets you view the CRM but not change it." });
    }
    const audience = await crmAudience(session.user.id);
    if (!audience.allowed) {
      return json(403, { error: "The CRM is limited to the Sales and Leadership teams." });
    }
    const isFullAccess = FULL_ACCESS_ROLES.includes(session.user.role as Role);
    if (access === "admin" && !isFullAccess) {
      return json(403, { error: "This area is restricted to CRM administrators." });
    }

    // Worked out once per request and hung on it, so every CRM query can narrow itself to this
    // person's own scope without repeating the lookup.
    const scope = await resolveDataScope(session.user.id);

    return await runWithScope(scope, async () => {
      const native = await nativeRoute(method, path, { session, caps, scope, isFullAccess });
      if (native) return native;

      const mounted = findMount(path);
      // Fail closed: nothing outside the mount table is reachable.
      if (!mounted) return json(404, { error: "Not found" });

      const crmReq = await toCrmRequest(req, mounted.rest, method);
      crmReq.auth = {
        sub: session.user.id,
        role: String(session.user.role),
        name: session.user.name ?? null,
        departmentSlug: session.user.departmentSlug ?? null,
      };
      crmReq.scope = scope;
      // Revenue in CRM reports is Leadership-only (COO decision 2026-09-29): the revenue report
      // is refused outright, and money fields are stripped from every other report response.
      if (path.startsWith("/reports") && !audience.isLeadership) {
        if (/^\/reports\/revenue-by-rep(\/|$)/.test(path)) {
          return json(403, { error: "Revenue reports are limited to Leadership." });
        }
        return stripRevenue(await runRouter(mounted.router, crmReq, method, mounted.rest));
      }
      return runRouter(mounted.router, crmReq, method, mounted.rest);
    });
  } catch (err) {
    return errorResponse(err);
  }
}

