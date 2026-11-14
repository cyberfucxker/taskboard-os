import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataScope } from './hierarchy';

/**
 * The signed-in person's data scope, carried through a request without being passed down every
 * call.
 *
 * This exists so the Prisma layer can narrow lead queries on its own (see `../prisma.ts`). Routes
 * still scope themselves explicitly where it matters — this is the net underneath, so a report
 * added next month is private by default instead of by somebody remembering.
 *
 * Background work — the CRM tick (automation resumer, follow-up reminders, AI SDR pass) and the
 * public webhooks — runs outside any signed-in request, so there is no context and nothing is
 * narrowed. That is correct: those act as the system, not as a person, and must see every lead.
 */
const storage = new AsyncLocalStorage<{ scope?: DataScope }>();

export function runWithScope<T>(scope: DataScope | undefined, fn: () => T): T {
  return storage.run({ scope }, fn);
}

export function currentScope(): DataScope | undefined {
  return storage.getStore()?.scope;
}

/** Runs `fn` as the system, ignoring whoever's request we happen to be inside. */
export function runUnscoped<T>(fn: () => T): T {
  return storage.run({ scope: undefined }, fn);
}
