import { sseEmitter } from "@/lib/emitter";

/**
 * Realtime change feed — the server half.
 *
 * Every write made through the shared Prisma client (every API route, server action, cron job,
 * webhook and the CRM) reports which model it touched. Changes are coalesced for a moment and
 * broadcast on `sseEmitter` as one `change` envelope, which /api/stream forwards to every signed-in
 * browser. The envelope carries model NAMES only — never a row — so it cannot leak data across
 * access boundaries; each browser refetches through its own permission-checked routes.
 *
 * Doing this in the Prisma layer rather than in each route is deliberate: there are ~150 routes
 * and a change announced by remembering to is a change that is eventually forgotten.
 */

/** Models written constantly as telemetry/logging. Announcing them would refresh every screen
 *  every few seconds for nothing a person is looking at. */
const QUIET_MODELS = new Set([
  "Device",
  "DeviceActivity",
  "DeviceCommand",
  "Screenshot",
  "AiUsageDaily",
  "InsightCache",
  "PushSubscription",
  "Outbox",
  "Activity",
  "CrmTelephonyEvent",
]);

const WRITE_OPS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

const COALESCE_MS = 300;

const g = globalThis as unknown as { __taskboardRealtime?: { pending: Set<string>; timer: ReturnType<typeof setTimeout> | null } };
const state = (g.__taskboardRealtime ??= { pending: new Set<string>(), timer: null });

export function announceChange(model: string) {
  if (QUIET_MODELS.has(model)) return;
  state.pending.add(model);
  if (state.timer) return;
  state.timer = setTimeout(() => {
    const models = [...state.pending];
    state.pending.clear();
    state.timer = null;
    sseEmitter.emit("change", { models, at: Date.now() });
  }, COALESCE_MS);
}

/** Prisma client extension: announce after every successful write. */
// A plain extension object, NOT Prisma.defineExtension(): some client components import lib/db
// indirectly, and defineExtension throws as soon as its module is evaluated in a browser bundle.
export const realtimeExtension = {
  name: "taskboardRealtime",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: {
        model: string;
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) {
        const result = await query(args);
        if (WRITE_OPS.has(operation)) announceChange(model);
        return result;
      },
    },
  },
};
