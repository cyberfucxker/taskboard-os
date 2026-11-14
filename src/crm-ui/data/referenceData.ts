import type { Team } from '../types';
import { api } from '../services/apiClient';

/**
 * Cached reference data — the TaskBoard employee directory and CRM teams.
 *
 * Screens import these and read them synchronously to turn an id into a name
 * (`findUserById`, `userDisplayName`). The data is fetched once and held in module-level
 * arrays that are mutated IN PLACE, so the array identities stay stable and
 * `ReferenceDataProvider` only has to trigger one re-render when the load lands.
 */

/** An active TaskBoard employee, as `GET /api/crm/users` returns it. */
export interface CrmUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentSlug?: string | null;
  departmentName?: string | null;
  phone?: string | null;
}

export const refUsers: CrmUser[] = [];
/** Same people as refUsers — kept as its own name because the CRM screens read it. */
export const refEmployees: CrmUser[] = [];
export const refTeams: Team[] = [];
/**
 * Who this person may hand a lead to, decided by the server (`/api/crm/users/assignable`).
 * Offering a name the API would refuse is worse than not offering it.
 */
export const refAssignable: CrmUser[] = [];

let loaded = false;
let inFlight: Promise<void> | null = null;

function replace<T>(target: T[], next: T[]): void {
  target.length = 0;
  target.push(...next);
}

/**
 * Loads (or reloads) the caches. Concurrent callers share one request, so the several
 * screens that mount at once do not each trigger their own fetch.
 */
export function loadReferenceData(force = false): Promise<void> {
  if (loaded && !force) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const [users, assignable, teams] = await Promise.all([
      // A limited role may get 403 on some of these; an empty cache is the right answer.
      api.get<CrmUser[]>('/users').catch(() => [] as CrmUser[]),
      api.get<CrmUser[]>('/users/assignable').catch(() => [] as CrmUser[]),
      api
        .get<{ id: string; name: string; leadId?: string | null; memberIds: string[] }[]>('/teams')
        .catch(() => []),
    ]);

    replace(refUsers, users);
    replace(refEmployees, users);
    replace(refAssignable, assignable);
    replace(
      refTeams,
      teams.map((t) => ({ id: t.id, name: t.name, leaderId: t.leadId ?? '', memberIds: t.memberIds ?? [], createdAt: '' }))
    );
    loaded = true;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Clears the caches, so a different user never sees the previous one's data. */
export function resetReferenceData(): void {
  [refUsers, refEmployees, refAssignable, refTeams].forEach((arr) => {
    arr.length = 0;
  });
  loaded = false;
}

export function isReferenceDataLoaded(): boolean {
  return loaded;
}

// ---------------------------------------------------------------------------
// Lookups — same names and signatures the screens already call.
// ---------------------------------------------------------------------------

export function findUserById(id?: string): CrmUser | undefined {
  return id ? refUsers.find((u) => u.id === id) : undefined;
}

/** A person's name, or a dash — screens render this straight into a table cell. */
export function userDisplayName(id?: string): string {
  return findUserById(id)?.name ?? '—';
}

export function teamById(id?: string): Team | undefined {
  return id ? refTeams.find((t) => t.id === id) : undefined;
}

/** Assignable owners for CRM lead assignment and conversation ownership. */
export function assignableUsers(): CrmUser[] {
  return refAssignable.length ? refAssignable : refEmployees;
}
