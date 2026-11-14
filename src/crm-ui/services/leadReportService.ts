import { findUserById } from '../data/referenceData';
import { LEAD_SOURCE_META } from '../constants/leadSources';
import { api, toQueryString } from './apiClient';

// ---------------------------------------------------------------------------
// Real backend-backed report/dashboard service (server/src/routes/reports.ts) — every
// number here is a live aggregate over the real Lead/LeadFollowUp tables, so it reflects
// Meta-sourced leads alongside manually created ones. Partner/user *names* are still
// resolved from the mock partner layer (see findUserById) since Users/Teams haven't been
// migrated off it — only the id itself comes from the backend.
// ---------------------------------------------------------------------------

/**
 * What the CRM Overview is filtered to. Every figure on that page takes the same object, so
 * the cards, the trend, the status ring and the stage breakdown always describe one set of
 * leads rather than four.
 */
export interface OverviewFilters {
  /** Created on or after / on or before, YYYY-MM-DD, read as IST by the server. */
  dateFrom?: string;
  dateTo?: string;
  /** A pipeline id, or `none` for leads that are on no pipeline. */
  pipelineId?: string;
  /** The Meta lead form — the closest thing to filtering by ad, since each ad runs its own. */
  formName?: string;
  campaignName?: string;
  /** A user id, or `none` for leads nobody owns. Narrowed to the caller's hierarchy server-side. */
  assignedUserId?: string;
  /** A StageGroup id. The server expands it to the stages behind it, so one definition holds. */
  stageGroupId?: string;
  [key: string]: unknown;
}

export interface LeadDashboardStats {
  totalLeads: number;
  newToday: number;
  newThisWeek: number;
  newThisMonth: number;
  conversionRate: number;
  activeInPipeline: number;
  wonDeals: number;
  wonValue: number;
}

export async function getDashboardStats(filters: OverviewFilters = {}): Promise<LeadDashboardStats> {
  return api.get<LeadDashboardStats>(`/reports/dashboard-stats${toQueryString(filters)}`);
}

export async function getLeadCreationTrend(days = 14, filters: OverviewFilters = {}): Promise<{ date: string; leads: number }[]> {
  return api.get(`/reports/lead-trend${toQueryString({ days, ...filters })}`);
}

export async function getStatusBreakdown(filters: OverviewFilters = {}): Promise<{ name: string; value: number }[]> {
  return api.get(`/reports/status-breakdown${toQueryString(filters)}`);
}

export async function getSourcePerformance() {
  const rows = await api.get<{ source: string; total: number; won: number; conversionRate: number }[]>('/reports/source-performance');
  return rows.map((r) => ({ ...r, label: LEAD_SOURCE_META[r.source]?.label ?? r.source }));
}

export interface StageDistribution {
  /** Null when the filter asked for leads on no pipeline — there are no stages to break down. */
  pipelineId: string | null;
  pipelineName: string | null;
  /** True when these rows are stage GROUPS; false when the pipeline has none and shows raw stages. */
  grouped: boolean;
  /** A group id when grouped, a stage id otherwise. */
  stages: { id?: string; name: string; value: number; color: string }[];
}

export async function getStageDistribution(filters: OverviewFilters = {}): Promise<StageDistribution> {
  return api.get<StageDistribution>(`/reports/stage-distribution${toQueryString(filters)}`);
}

export async function getAssigneePerformance() {
  const rows = await api.get<{ userId: string; total: number; won: number; lost: number; conversionRate: number }[]>(
    '/reports/assignee-performance'
  );
  return rows.map((r) => ({ ...r, name: findUserById(r.userId)?.name ?? 'Unknown' }));
}

export async function getFollowUpPerformance() {
  return api.get<{ total: number; completed: number; missed: number; pending: number; rescheduled: number; completionRate: number }>(
    '/reports/followup-performance'
  );
}

export async function getLeadReportRows(dateFrom?: string, dateTo?: string) {
  const rows = await api.get<
    { id: string; name: string; source: string; status: string; priority: string; assignedUserId?: string; assignedTo?: string; dealValue: number; createdAt: string }[]
  >(`/reports/lead-rows${toQueryString({ dateFrom, dateTo })}`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    source: LEAD_SOURCE_META[r.source]?.label ?? r.source,
    status: r.status,
    priority: r.priority,
    assignedTo: r.assignedUserId ? (findUserById(r.assignedUserId)?.name ?? '—') : (r.assignedTo ?? 'Unassigned'),
    dealValue: r.dealValue,
    createdAt: r.createdAt,
  }));
}
