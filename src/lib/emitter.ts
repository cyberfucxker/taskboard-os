import { EventEmitter } from 'events';

const globalForEmitter = globalThis as unknown as {
  sseEmitter: EventEmitter | undefined;
};

export const sseEmitter = globalForEmitter.sseEmitter ?? new EventEmitter();

// Always pinned to globalThis: Next bundles route handlers separately, and a per-bundle emitter
// would mean /api/stream never hears the writes announced from other routes.
globalForEmitter.sseEmitter = sseEmitter;
sseEmitter.setMaxListeners(500);
