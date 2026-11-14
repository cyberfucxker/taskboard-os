/** IST day helpers shared by the TaskBoard 3 Today widgets (server side). */
const IST = 5.5 * 3600 * 1000;

/** Start of today in IST, as a UTC Date. */
export function istDayStart(now = new Date()) {
  const d = new Date(now.getTime() + IST);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST);
}

/** Today's IST date as yyyy-mm-dd. */
export function istDateKey(now = new Date()) {
  return new Date(now.getTime() + IST).toISOString().slice(0, 10);
}

export function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const DAY = 24 * 3600 * 1000;

/**
 * Urgency rank used to sort every Today list: lower = more urgent.
 * overdue (0) < due today (1) < due within 7 days (2) < later (3) < no date (4);
 * priority P0..P3 breaks ties inside a band.
 */
export function urgency(due: Date | null, priority: string, dayStart = istDayStart()) {
  const band = !due ? 4 : due < dayStart ? 0 : due.getTime() < dayStart.getTime() + DAY ? 1 : due.getTime() < dayStart.getTime() + 7 * DAY ? 2 : 3;
  const p = ["P0", "P1", "P2", "P3"].indexOf(priority);
  return band * 10 + (p < 0 ? 2 : p);
}
