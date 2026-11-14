import type { LeadSource, LeadStage } from "@prisma/client";

/**
 * Identity normalisation for leads.
 *
 * The same person arrives spelled a dozen different ways: "+91 99999-88888",
 * "099999 88888", "9999988888". Dedupe only works if every write path folds
 * those into one comparable value, and it has to be the SAME fold everywhere
 * or the dedupe silently misses.
 *
 * These two columns are indexed but deliberately NOT unique. A hard unique
 * index would turn "two people share a business phone number" into a P2002
 * insert failure — and in the Meta webhook that becomes a 500, which makes
 * Meta retry forever while the lead is never captured. Enforcing identity in
 * the application keeps a bad row from taking down live lead capture; the
 * importer reports conflicts instead of exploding.
 */

const DEFAULT_COUNTRY_CODE = "91";

/**
 * Digits-only form used for comparison. Strips formatting but NOT the country
 * code, so a stored `+919999988888` and an incoming `9999988888` both reduce
 * to something comparable after `phoneKeys` below normalises the national part.
 */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // 00 is the international prefix.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // A national number dialled as 0 + 10 digits. Drop the trunk 0 before
  // prefixing, otherwise 09999988888 and 9999988888 become two different
  // people — which is the exact duplicate this is meant to catch.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  // A bare 10-digit national number gets our default country code.
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  return digits || null;
}

/**
 * All forms a stored phone could be matched by, cheapest first.
 *
 * A lead imported from TeleCRM might hold `+91 99999 88888` while the next CSV
 * row holds `9999988888`. Storing one canonical form and comparing only that
 * works — but only if every writer agrees on the canonical form. Rather than
 * trusting that, matching on the national number is what actually holds: it
 * survives the country code being written as `91`, `+91`, `0091` or `0`.
 */
export function phoneKeys(phone: string | null | undefined): string[] {
  const digits = phoneDigits(phone);
  if (!digits) return [];
  const keys = new Set<string>();
  keys.add(digits);

  // 919999988888 -> national 9999988888
  const national = digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length > 10
    ? digits.slice(DEFAULT_COUNTRY_CODE.length)
    : digits;
  keys.add(national);
  if (national.startsWith("0") && national.length > 10) keys.add(national.slice(1));

  return [...keys].filter(Boolean);
}

export function emailNormalized(email: string | null | undefined): string | null {
  if (!email) return null;
  const v = String(email).trim().toLowerCase();
  if (!v || !v.includes("@")) return null;
  return v;
}

export function nameParts(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(" ");
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/**
 * Header-name matching for CSV columns.
 *
 * TeleCRM exports and Meta exports both use friendly headers ("Full Name",
 * "E-mail Address", "Mobile Number") that do not line up with our field names.
 * Matching on a normalised token set means an admin rarely has to map anything
 * by hand, and the mapping UI only has to show the leftovers.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "fullname", "fullnameofcontact", "contactname", "leadname", "customer", "clientname", "person", "contactperson"],
  firstName: ["firstname", "fname", "first", "givenname", "given"],
  lastName: ["lastname", "lname", "last", "surname", "familyname", "family"],
  company: ["company", "companyname", "organisation", "organization", "business", "firm", "account", "accountname", "businessname"],
  email: ["email", "e-mail", "emailaddress", "emailid", "workemail", "businessemail", "mail"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "cell", "cellphone", "contactnumber", "telephone", "tel", "number", "whatsapp", "whatsappnumber", "primaryphone"],
  city: ["city", "town", "location", "locality"],
  state: ["state", "province", "region"],
  country: ["country", "countryname", "nation"],
  notes: ["notes", "note", "remarks", "comment", "comments", "description", "details"],
  nextStep: ["nextstep", "nextaction", "followup", "followuptask", "nextfollowup"],
  score: ["score", "leadscore", "rating", "priority"],
  stage: ["stage", "status", "leadstage", "pipeline", "pipelinestage"],
  source: ["source", "leadsource", "channel", "medium", "utm_source", "utmsource", "campaign", "campaignname"],
  createdAt: ["createdat", "created", "date", "datecreated", "createdon", "entrydate", "timestamp"],
  owner: ["owner", "assigned", "assignedto", "salesrep", "ownerid", "responsible", "salesperson", "agent"],
};

const HEADER_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) m.set(a, field);
  }
  return m;
})();

/** Lowercase and strip everything that isn't a letter or digit: "E-mail Address" -> "emailaddress". */
export function normalizeHeader(header: string): string {
  return String(header ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Best-guess field for a CSV header, or null when we can't tell. */
export function guessField(header: string): string | null {
  return HEADER_LOOKUP.get(normalizeHeader(header)) ?? null;
}

/**
 * Build a header -> field map for an import, preferring an admin's explicit
 * choice and only guessing where they left it unmapped.
 */
export function buildColumnMap(
  headers: string[],
  explicit?: Record<string, string> | null
): { mapping: Record<string, string>; unmapped: string[] } {
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const h of headers) {
    const chosen = explicit?.[h];
    if (chosen) {
      mapping[h] = chosen;
      continue;
    }
    const guess = guessField(h);
    if (guess) mapping[h] = guess;
    else unmapped.push(h);
  }
  return { mapping, unmapped };
}

export type ImportConflict = "skip" | "update";

export interface ParsedRow {
  name: string;
  company: string;
  email: string | null;
  emailNorm: string | null;
  phone: string | null;
  phoneKeys: string[];
  city: string | null;
  notes: string | null;
  nextStep: string | null;
  score: number | null;
  source: LeadSource | null;
  stage: LeadStage | null;
  ownerName: string | null;
  createdAt: Date | null;
  /** Fields the admin mapped but we could not parse into anything useful. */
  problems: string[];
}

const VALID_SOURCES = new Set<string>([
  "INBOUND", "META_LEAD_ADS", "GOOGLE_LEAD_FORM", "WHATSAPP", "INDIA_MART", "JUSTDIAL",
  "MARKETPLACE", "REFERRAL", "CALL", "WALK_IN", "CHATBOT", "LINKEDIN", "EMAIL",
  "OUTBOUND", "WEBINAR", "MANUAL", "IMPORTED", "TELECRM",
]);

/** Every valid LeadSource, for zod enums and the import UI's source picker. */
export const LEAD_SOURCES = [...VALID_SOURCES];

const VALID_STAGES = new Set<string>([
  "NEW", "CONTACTED", "QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST",
]);

function parseScore(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).trim().replace(/[^0-9.\-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  // A bare "2024" or "13/01" parses to something absurd; reject the far future.
  const year = d.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return d;
}

export function parseStage(raw: string | undefined): LeadStage | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_STAGES.has(v)) return v as LeadStage;
  // Match on the original text lowercased, not `v`: after the underscore
  // rewrite "\bwon\b" cannot match "CLOSED_WON", because `_` is itself a word
  // character and there is no boundary between them.
  const lower = raw.trim().toLowerCase();
  if (/\bwon\b/.test(lower) || /closed[\s_-]?won/.test(lower)) return "WON";
  if (/\blost\b/.test(lower)) return "LOST";
  return null;
}

export function parseSource(raw: string | undefined): LeadSource | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_SOURCES.has(v)) return v as LeadSource;
  const lower = raw.trim().toLowerCase();
  if (/tele/.test(lower)) return "TELECRM";
  if (/import|csv|upload|bulk/.test(lower)) return "IMPORTED";
  if (/meta|facebook|instagram|\bfb\b/.test(lower)) return "META_LEAD_ADS";
  if (/google/.test(lower)) return "GOOGLE_LEAD_FORM";
  if (/whatsapp/.test(lower)) return "WHATSAPP";
  if (/justdial/.test(lower)) return "JUSTDIAL";
  if (/indiamart/.test(lower)) return "INDIA_MART";
  if (/referr/.test(lower)) return "REFERRAL";
  if (/call/.test(lower)) return "CALL";
  if (/walk/.test(lower)) return "WALK_IN";
  if (/chat/.test(lower)) return "CHATBOT";
  if (/linkedin/.test(lower)) return "LINKEDIN";
  if (/email/.test(lower)) return "EMAIL";
  if (/webinar/.test(lower)) return "WEBINAR";
  if (/outbound|prospect|cold/.test(lower)) return "OUTBOUND";
  if (/inbound|landing|web|site|organic/.test(lower)) return "INBOUND";
  return null;
}

/**
 * Turn one raw CSV/TeleCRM row into a lead-shaped object.
 *
 * A row with neither phone nor email is kept as `problems` rather than
 * dropped here — the caller decides, because a dry run has to report the same
 * rows a real import would reject.
 */
/**
 * True when a column map exposes at least one field we can identify a lead by.
 *
 * `buildColumnMap` produces a header -> field map, so the fields live in the
 * VALUES. Testing the keys instead would reject every real-world header like
 * "Full Name" or "Mobile Number" and only accept a column literally named
 * "name".
 */
export function hasIdentityColumn(mapping: Record<string, string>): boolean {
  const fields = new Set(Object.values(mapping));
  return fields.has("name") || fields.has("email") || fields.has("phone");
}

export function parseRow(row: Record<string, string>, mapping: Record<string, string>): ParsedRow {
  const problems: string[] = [];
  const get = (field: string): string | undefined => {
    for (const [header, f] of Object.entries(mapping)) {
      if (f === field) {
        const v = row[header];
        if (v != null && String(v).trim()) return String(v);
      }
    }
    return undefined;
  };

  const rawFirst = get("firstName")?.trim();
  const rawLast = get("lastName")?.trim();
  const rawFull = get("name")?.trim();
  let name = [rawFirst, rawLast].filter(Boolean).join(" ").trim();
  if (!name && rawFull) {
    const p = nameParts(rawFull);
    name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  }
  if (!name) {
    name = get("email")?.trim() || get("phone")?.trim() || "";
  }
  if (!name) problems.push("No name, email or phone — nothing to identify this lead by.");

  const email = get("email")?.trim() || null;
  const emailNorm = emailNormalized(email);
  if (email && !emailNorm) problems.push(`Email "${email}" is not a valid address.`);

  const phone = get("phone")?.trim() || null;
  const keys = phoneKeys(phone);
  if (phone && keys.length === 0) problems.push(`Phone "${phone}" has no digits.`);

  // An import row with no email AND no phone cannot be matched against
  // anything, now or on a later re-run. Surface it — the caller decides
  // whether to reject the row or import it blind.
  if (!emailNorm && keys.length === 0) {
    problems.push("No usable email or phone — cannot dedupe this lead.");
  }

  const company = get("company")?.trim() || "Unknown";
  const city = get("city")?.trim() || null;
  const notesParts: string[] = [];
  if (get("notes")) notesParts.push(get("notes")!.trim());
  if (city) notesParts.push(`City: ${city}`);

  const sourceRaw = get("source");
  const parsedSource = parseSource(sourceRaw);
  if (sourceRaw && !parsedSource) problems.push(`Source "${sourceRaw}" not recognised — defaulted to IMPORTED.`);

  const stageRaw = get("stage");
  const parsedStage = parseStage(stageRaw);
  if (stageRaw && !parsedStage) problems.push(`Stage "${stageRaw}" not recognised — defaulted to NEW.`);

  return {
    name: name || "Unknown",
    company,
    email,
    emailNorm,
    phone,
    phoneKeys: keys,
    city,
    notes: notesParts.length ? notesParts.join("\n") : null,
    nextStep: get("nextStep")?.trim() || null,
    score: parseScore(get("score")),
    source: parsedSource,
    stage: parsedStage,
    ownerName: get("owner")?.trim() || null,
    createdAt: parseDate(get("createdAt")),
    problems,
  };
}

/**
 * Every identity a row can be recognised by, for catching repeats inside a
 * single file.
 *
 * A row must be tested against ALL of these, not just the first. Keying on the
 * email when the row has one and on the phone otherwise let the same person
 * through twice in one file — once matched on `e:`, once on `p:` — and because
 * the batch-level lookup only reads the database, it could not catch the pair
 * either: neither row existed in the database yet. This mirrors the
 * cross-database match, which already accepts a hit on any single key.
 */
export function identityKeys(emailNorm: string | null, keys: string[]): string[] {
  const out: string[] = [];
  if (emailNorm) out.push(`e:${emailNorm}`);
  for (const k of keys) if (k) out.push(`p:${k}`);
  return out;
}
