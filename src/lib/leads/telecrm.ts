import { prisma } from "@/lib/db";
import { resolveConfigValue } from "@/lib/integrations/credentials";
import { importLeads, type ImportReport } from "./importer";

/**
 * TeleCRM -> TaskBoard lead sync.
 *
 * The API details that shaped this file:
 *  - `POST https://next.telecrm.in/autoupdate/v2/enterprise/{enterpriseId}/lead/search`
 *    with `?skip=&limit=&onlyCount=`, limit capped at 100.
 *  - Needs a **Sync** token. An Async token is push-only and will not read.
 *  - There is NO date/created filter on search. So a nightly job cannot ask
 *    "what changed since last night" — it has to page through everything.
 *
 * The last point is why the cursor is a skip offset rather than a timestamp,
 * and why dedupe is the thing standing between a nightly job and a database
 * full of copies of itself: a row whose lead already exists is matched on
 * normalised phone/email and never created again.
 */

const BASE = "https://next.telecrm.in/autoupdate/v2";
const PAGE_LIMIT = 100;

export interface TeleCrmConfig {
  enterpriseId: string;
  token: string;
  baseUrl?: string;
}

export interface SyncOptions {
  /** Stop after this many pages — for a first run over a large account. */
  maxPages?: number;
  /** Only walk history from this point onward (page index). */
  startPage?: number;
  dryRun?: boolean;
  actorId?: string | null;
  conflictPolicy?: "skip" | "update";
}

export interface SyncResult {
  ok: boolean;
  provider: string;
  pagesFetched: number;
  remoteTotal: number | null;
  /** Leads read by THIS run, not the running total. */
  pulled: number;
  report: ImportReport | null;
  stoppedBecause: "maxPages" | "reachedEnd" | "error";
  /** Page this run started from, so a resume is visible in the UI. */
  resumedFrom: number;
  /** "not_configured" is a setup problem; "upstream_error" is TeleCRM's. */
  code?: "not_configured" | "upstream_error";
  error?: string;
}

export class TeleCrmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "TeleCrmError";
  }
}

/** Read credentials from the admin-entered provider config (env-first). */
export async function readTeleCrmConfig(): Promise<TeleCrmConfig | null> {
  const enterpriseId = await resolveConfigValue("telecrm", "TELECRM_ENTERPRISE_ID");
  const token = await resolveConfigValue("telecrm", "TELECRM_SYNC_TOKEN");
  const baseUrl = await resolveConfigValue("telecrm", "TELECRM_BASE_URL");
  if (!enterpriseId || !token) return null;
  return { enterpriseId, token, baseUrl: baseUrl || undefined };
}

interface TeleCrmLead {
  id?: number | string;
  employeeid?: number | string;
  created?: string;
  modified?: string;
  status?: string | number;
  score?: number | string;
  fields?: Record<string, unknown>;
}

/**
 * One page of leads. Throws TeleCrmError with the status so a bad token is
 * reported as "your token is wrong", not "sync failed, try later".
 */
export async function fetchLeadPage(
  cfg: TeleCrmConfig,
  skip: number,
  limit = PAGE_LIMIT
): Promise<{ leads: TeleCrmLead[]; total: number | null }> {
  const base = (cfg.baseUrl || BASE).replace(/\/+$/, "");
  const url = `${base}/enterprise/${encodeURIComponent(cfg.enterpriseId)}/lead/search?skip=${skip}&limit=${limit}&onlyCount=false`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // TeleCRM takes the token in this header, not as a bearer.
      Authorization: `Bearer ${cfg.token}`,
    },
    body: "{}",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new TeleCrmError(
        "TeleCRM rejected the token. Check it is a **Sync** token (Async tokens cannot read leads).",
        res.status
      );
    }
    throw new TeleCrmError(`TeleCRM search failed (${res.status}): ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as {
    data?: TeleCrmLead[];
    total_count?: number;
  };

  return {
    leads: Array.isArray(json.data) ? json.data : [],
    total: typeof json.total_count === "number" ? json.total_count : null,
  };
}

/**
 * TeleCRM returns every lead field in a free-form `fields` map keyed by its
 * own field id/name, which is why the row goes through the same
 * header-guessing path as a CSV: flatten the map into a normal record and let
 * the shared alias table work out which value is the phone number.
 */
export function telecrmToRow(lead: TeleCrmLead): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(lead.fields ?? {})) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      const joined = v.map((x) => (x != null ? String(x) : "")).filter(Boolean).join(", ");
      if (joined) row[k] = joined;
    } else if (typeof v === "object") {
      // e.g. nested option objects; keep the label if there is one.
      const o = v as Record<string, unknown>;
      const label = String(o.value ?? o.name ?? o.text ?? "");
      if (label) row[k] = label;
    } else {
      // An empty string is dropped, not kept: a blank cell must not look like
      // a present-but-empty field to the importer's header matching.
      const s = String(v);
      if (s.trim()) row[k] = s;
    }
  }
  if (lead.id != null) row["TeleCRM ID"] = String(lead.id);
  if (lead.created) row["Created At"] = String(lead.created);
  if (lead.modified) row["Modified At"] = String(lead.modified);
  if (lead.status != null) row["Status"] = String(lead.status);
  if (lead.score != null) row["Score"] = String(lead.score);
  return row;
}

/**
 * Where the next run should resume from, or null to start from the beginning.
 *
 * The rule is deliberately conservative: a cursor survives only a run that was
 * cut short by the page cap. A run that reached the end clears it, because
 * TeleCRM's `skip` paging has no documented sort order — if it returns
 * newest-first, a lasting high-water mark would skip every lead added since the
 * last complete pass. Re-reading the list each night is safe (the importer
 * dedupes); silently missing new leads would not be.
 */
export function nextCursorAfterRun(
  stoppedBecause: SyncResult["stoppedBecause"],
  skip: number
): string | null {
  if (stoppedBecause !== "maxPages") return null;
  return String(Math.floor(skip / PAGE_LIMIT));
}

async function getCursor(provider: string): Promise<string | null> {
  const cp = await prisma.crmSyncCheckpoint.findUnique({ where: { provider } });
  return cp?.cursor ?? null;
}

async function setCursor(
  provider: string,
  patch: { cursor?: string | null; status: string; error?: string | null; count: number }
) {
  const now = new Date();
  await prisma.crmSyncCheckpoint.upsert({
    where: { provider },
    create: {
      provider,
      cursor: patch.cursor ?? null,
      lastRunAt: now,
      lastSuccessAt: patch.status === "ok" ? now : null,
      lastStatus: patch.status,
      lastError: patch.error ?? null,
      lastCount: patch.count,
    },
    update: {
      cursor: patch.cursor ?? null,
      lastRunAt: now,
      ...(patch.status === "ok" ? { lastSuccessAt: now } : {}),
      lastStatus: patch.status,
      lastError: patch.error ?? null,
      lastCount: patch.count,
    },
  });
}

export async function syncTeleCrmLeads(opts: SyncOptions = {}): Promise<SyncResult> {
  const provider = "telecrm";
  const cfg = await readTeleCrmConfig();
  if (!cfg) {
    return {
      ok: false,
      provider,
      pagesFetched: 0,
      remoteTotal: null,
      pulled: 0,
      report: null,
      stoppedBecause: "error",
      resumedFrom: 0,
      code: "not_configured",
      error: "TeleCRM is not configured. Add the enterprise ID and a Sync token first.",
    };
  }

  const dryRun = opts.dryRun ?? false;
  // A cursor is only ever written when a run was cut short, so anything left
  // here is genuinely unfinished work worth resuming. Without this the nightly
  // job silently restarted at page 0 every time and the checkpoint was dead
  // weight.
  const stored = opts.startPage == null ? await getCursor(provider) : null;
  const parsed = stored == null ? NaN : Number(stored);
  const startPage = opts.startPage ?? (Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  let skip = startPage * PAGE_LIMIT;
  let pulled = 0;
  let pages = 0;
  let total: number | null = null;
  let stoppedBecause: SyncResult["stoppedBecause"] = "reachedEnd";

  try {
    // Walk pages, handing each batch to the shared importer. Imported per page
    // rather than accumulating the whole account in memory: a 50k-lead
    // history is fine streamed and fatal buffered.
    for (;;) {
      const page = await fetchLeadPage(cfg, skip, PAGE_LIMIT);
      total = page.total ?? total;
      pages++;

      if (page.leads.length === 0) {
        stoppedBecause = "reachedEnd";
        break;
      }

      const rows = page.leads.map(telecrmToRow);
      // Dedupe against what is already in TaskBoard happens inside the importer.
      await importLeads(rows, {
        defaultSource: "TELECRM",
        conflictPolicy: opts.conflictPolicy ?? "skip",
        dryRun,
        actorId: opts.actorId ?? null,
      });

      skip += page.leads.length;
      pulled += page.leads.length;

      if (opts.maxPages != null && pages >= opts.maxPages) {
        stoppedBecause = "maxPages";
        break;
      }
      if (total != null && skip >= total) {
        stoppedBecause = "reachedEnd";
        break;
      }
    }

    if (!dryRun) {
      await setCursor(provider, {
        cursor: nextCursorAfterRun(stoppedBecause, skip),
        status: "ok",
        count: pulled,
      });
    }

    return {
      ok: true,
      provider,
      pagesFetched: pages,
      remoteTotal: total,
      pulled,
      report: null,
      stoppedBecause,
      resumedFrom: startPage,
    };
  } catch (err) {
    const message = (err as Error).message;
    if (!dryRun) {
      // Hold the position so the next run retries from the same page.
      await setCursor(provider, {
        cursor: String(startPage),
        status: "error",
        error: message.slice(0, 500),
        count: pulled,
      });
    }
    return {
      ok: false,
      provider,
      pagesFetched: pages,
      remoteTotal: total,
      pulled,
      report: null,
      stoppedBecause: "error",
      resumedFrom: startPage,
      code: "upstream_error",
      error: message,
    };
  }
}

export async function teleCrmSyncState() {
  return prisma.crmSyncCheckpoint.findUnique({ where: { provider: "telecrm" } });
}
