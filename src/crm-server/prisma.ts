import { prisma as base } from "@/lib/db";
import { ownerScope } from "./services/hierarchy";
import { currentScope } from "./services/requestContext";
import { emailNormalized, phoneKeys } from "@/lib/leads/normalize";
import { placementFor } from "@/lib/crm/bridge";

/**
 * The CRM's Prisma client: TaskBoard's shared client, extended with the one rule the the legacy CRM CRM
 * relied on (ported from its server/src/prisma.ts, retargeted at CrmLead).
 *
 * A **read** of `CrmLead` made inside a signed-in request is narrowed to the leads that
 * person's scope owns. This is the backstop, not the only defence — the CRM routes scope
 * themselves too — but it means a query somebody writes later is private by default rather
 * than by remembering to be. Deliberately reads only: silently narrowing an update would turn
 * a forbidden action into a quiet no-op, which is far worse to debug than a 403.
 *
 * `findUnique` is served as `findFirst` (a unique lookup cannot take the extra condition), and
 * the scope is ANDed onto the caller's `where`, never merged into it, so it can only narrow.
 */
/**
 * Writes: keep CrmLead.phoneNormalized / emailNormalized in step with phone / email.
 *
 * Those columns did not exist in the legacy CRM; TaskBoard's TeleCRM/CSV importers de-duplicate on them.
 * The ported routes write `phone` and `email` from half a dozen places (manual create, bulk
 * edit, CSV import, web forms, Meta, generic webhooks), so the normalised copy is derived here,
 * once, with the importer's own functions — a lead created from a web form is then found by the
 * next TeleCRM sync instead of being imported a second time.
 */
function withNormalizedContact(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(withNormalizedContact);
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d };
  const plain = (v: unknown) => (v && typeof v === "object" && "set" in (v as object) ? (v as { set: unknown }).set : v);
  if ("phone" in d && !("phoneNormalized" in d)) {
    const phone = plain(d.phone);
    out.phoneNormalized = typeof phone === "string" ? phoneKeys(phone)[0] ?? null : null;
  }
  if ("email" in d && !("emailNormalized" in d)) {
    const email = plain(d.email);
    out.emailNormalized = typeof email === "string" ? emailNormalized(email) : null;
  }
  return out;
}

/** A lead created without a pipeline goes onto the default pipeline's first stage. */
async function withDefaultPlacement(args: { data: Record<string, unknown> }) {
  const d = args.data;
  if (!d || d.pipelineId || d.pipeline || d.pipelineStageId || d.stage) return args;
  const place = await placementFor("NEW");
  return {
    ...args,
    data: { ...d, pipelineId: place.pipelineId, pipelineStageId: place.pipelineStageId, stageEnteredAt: d.stageEnteredAt ?? new Date() },
  };
}

const WRITES = new Set(["create", "createMany", "update", "updateMany"]);

const READS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);

function narrow(where: Record<string, unknown> | undefined, scoped: Record<string, unknown>) {
  if (!where || Object.keys(where).length === 0) return scoped;
  return { AND: [where, scoped] };
}

export const prisma = base.$extends({
  name: "crmLeadScope",
  query: {
    crmLead: {
      async $allOperations({ operation, args, query, model }) {
        if (WRITES.has(operation)) {
          const a = args as { data?: unknown };
          if (a.data !== undefined) args = { ...a, data: withNormalizedContact(a.data) } as typeof args;
          if (operation === "create") args = (await withDefaultPlacement(args as { data: Record<string, unknown> })) as typeof args;
        } else if (operation === "upsert") {
          const a = args as { create?: unknown; update?: unknown };
          args = { ...a, create: withNormalizedContact(a.create), update: withNormalizedContact(a.update) } as typeof args;
        }

        const scope = currentScope();
        if (!scope || scope.isAll) return query(args);
        const scoped = ownerScope(scope);

        if (READS.has(operation)) {
          const a = args as { where?: Record<string, unknown> };
          return query({ ...a, where: narrow(a.where, scoped) } as typeof args);
        }
        if (operation === "findUnique" || operation === "findUniqueOrThrow") {
          const a = args as { where?: Record<string, unknown> };
          const row = await (base as unknown as {
            crmLead: { findFirst: (x: unknown) => Promise<unknown> };
          }).crmLead.findFirst({ ...a, where: narrow(a.where, scoped) });
          if (!row && operation === "findUniqueOrThrow") throw new Error(`No CrmLead found (${model})`);
          return row as never;
        }
        return query(args);
      },
    },
  },
}) as unknown as typeof base;
