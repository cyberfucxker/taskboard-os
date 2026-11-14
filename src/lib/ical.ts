/**
 * Minimal read-only ICS (iCalendar) feed parser.
 *
 * Deliberately not a full RFC 5545 implementation — just enough to read
 * VEVENT blocks (SUMMARY, DTSTART, DTEND, LOCATION, UID) out of a Google /
 * Outlook "secret address" feed so an employee's external calendar shows up
 * in TaskBoard without needing OAuth. No recurrence expansion (RRULE) yet.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
}

function unfoldLines(raw: string): string[] {
  // RFC 5545: a line starting with a space/tab is a continuation of the previous line.
  const lines = raw.split(/\r\n|\n|\r/);
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseIcsDate(value: string): { date: Date; allDay: boolean } {
  // Forms seen in the wild: 20260919, 20260919T140000Z, 20260919T140000
  const clean = value.trim();
  const allDay = /^\d{8}$/.test(clean);
  if (allDay) {
    const y = Number(clean.slice(0, 4));
    const m = Number(clean.slice(4, 6)) - 1;
    const d = Number(clean.slice(6, 8));
    return { date: new Date(Date.UTC(y, m, d)), allDay: true };
  }
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { date: new Date(clean), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  return { date: new Date(iso), allDay: false };
}

/** Parses raw ICS text into a flat list of (non-recurring) events. */
export function parseIcs(raw: string): IcsEvent[] {
  const lines = unfoldLines(raw);
  const events: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      cur = {};
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (cur && cur.DTSTART) {
        const { date: start, allDay } = parseIcsDate(cur.DTSTART);
        const end = cur.DTEND ? parseIcsDate(cur.DTEND).date : new Date(start.getTime() + 30 * 60000);
        events.push({
          uid: cur.UID || `${cur.DTSTART}-${cur.SUMMARY || "event"}`,
          title: cur.SUMMARY || "(untitled)",
          start,
          end,
          allDay,
          location: cur.LOCATION || undefined,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    let key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    // Strip parameters, e.g. "DTSTART;TZID=Asia/Kolkata" -> "DTSTART"
    key = key.split(";")[0].toUpperCase();
    if (["SUMMARY", "DTSTART", "DTEND", "LOCATION", "UID"].includes(key)) {
      cur[key] = value;
    }
  }

  return events;
}

/** Fetches and parses an ICS feed URL. Returns [] on any failure — a broken feed must never break the calendar. */
export async function fetchIcsEvents(url: string, rangeStart: Date, rangeEnd: Date): Promise<IcsEvent[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const text = await res.text();
    const events = parseIcs(text);
    return events.filter((e) => e.start <= rangeEnd && e.end >= rangeStart);
  } catch {
    return [];
  }
}
