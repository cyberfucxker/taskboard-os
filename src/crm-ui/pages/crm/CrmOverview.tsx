import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, TrendingUp, Target, Trophy, Plus, GitBranch, CalendarClock } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { StatCardSkeleton } from '../../components/ui/LoadingSkeleton';
import { Card, CardHeader } from '../../components/ui/Card';
import { ChartCard } from '../../components/charts/ChartCard';
import { TrendAreaChart } from '../../components/charts/TrendAreaChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Avatar } from '../../components/ui/Avatar';
import { LeadSourceBadge } from '../../components/leads/LeadSourceBadge';
import { useAsync } from '../../hooks/useAsync';
import { usePermissions } from '../../app/usePermissions';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { SimpleBarChart } from '../../components/charts/SimpleBarChart';
import { usePipelineReferenceData } from '../../hooks/usePipelineReferenceData';
import {
  getDashboardStats, getLeadCreationTrend, getStatusBreakdown, getSourcePerformance,
  getStageDistribution, type OverviewFilters,
} from '../../services/leadReportService';
import { listAdSources, listAssignableUsers } from '../../services/leadService';
import { listFollowUps } from '../../services/followUpService';
import { listLeads } from '../../services/leadService';
import { leadFullName, formatCurrency, formatDate } from '../../utils/format';

/**
 * The people this person may filter by, by name.
 *
 * `/users/assignable` already returns only the caller's own hierarchy, so a team leader sees
 * their team and nobody else's. Sorted by name rather than grouped by role: whoever is
 * looking knows who their people are, and the headings were reading as an extra thing to
 * parse on the way to a name.
 */
function assigneeOptions(users: { id: string; name: string }[]) {
  return [...users]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({ value: u.id, label: u.name }));
}

/** Whole percent, and 0 rather than NaN when a pipeline is empty. */
function stagePct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export function CrmOverview() {
  const navigate = useNavigate();
  const { pipelines } = usePipelineReferenceData();
  const assignableUsers = listAssignableUsers();
  /**
   * The two cards at the bottom read leads and follow-ups directly, which a role without
   * those tabs cannot do. Hidden rather than left to render empty: "Recent Leads" with
   * nothing under it reads as "there are no leads", which is a different and wrong answer.
   */
  const { can } = usePermissions();
  const canSeeLeads = can('crm.leads');
  const canSeeFollowUps = can('crm.followups');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pipelineId, setPipelineId] = useState('all');
  const [formName, setFormName] = useState('all');
  const [assignedUserId, setAssignedUserId] = useState('all');
  const [stageGroupId, setStageGroupId] = useState('all');

  /**
   * One object for every figure on the page, so the cards, the trend, the status ring and the
   * stage breakdown are always describing the same set of leads. `all` and empty are dropped
   * rather than sent, which is what the server reads as "no filter".
   */
  const filters: OverviewFilters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      pipelineId: pipelineId !== 'all' ? pipelineId : undefined,
      formName: formName !== 'all' ? formName : undefined,
      assignedUserId: assignedUserId !== 'all' ? assignedUserId : undefined,
      stageGroupId: stageGroupId !== 'all' ? stageGroupId : undefined,
    }),
    [dateFrom, dateTo, pipelineId, formName, assignedUserId, stageGroupId]
  );
  const filterKey = JSON.stringify(filters);
  const hasFilters = !!(
    dateFrom || dateTo || pipelineId !== 'all' || formName !== 'all' || assignedUserId !== 'all' || stageGroupId !== 'all'
  );

  const { data: stats, isLoading: statsLoading } = useAsync(() => getDashboardStats(filters), [filterKey]);
  const { data: trend } = useAsync(() => getLeadCreationTrend(14, filters), [filterKey]);
  const { data: statusData } = useAsync(() => getStatusBreakdown(filters), [filterKey]);
  const { data: stageData } = useAsync(() => getStageDistribution(filters), [filterKey]);
  // The denominator is what is ON the pipeline's stages, not every lead the filter matched —
  // a percentage of a bigger number than the chart draws would never add up to 100.
  const stageTotal = (stageData?.stages ?? []).reduce((sum, st) => sum + st.value, 0);
  const { data: sourceRows } = useAsync(() => getSourcePerformance(), []);
  const { data: adSources } = useAsync(() => listAdSources(), []);
  const { data: overdue } = useAsync(
    () => (canSeeFollowUps ? listFollowUps({ bucket: 'overdue', pageSize: 5 }) : Promise.resolve(undefined)),
    [canSeeFollowUps]
  );
  const { data: recentLeadsPage } = useAsync(
    () => (canSeeLeads ? listLeads({ pageSize: 6, sortBy: 'createdAt', sortDir: 'desc' }) : Promise.resolve(undefined)),
    [canSeeLeads]
  );
  const recentLeads = recentLeadsPage?.items ?? [];

  return (
    <div>
      <PageHeader
        title="CRM Overview"
        description="Lead pipeline health across sources, stages and the sales team."
        actions={
          <>
            <Button variant="outline" leftIcon={<GitBranch size={15} />} onClick={() => navigate('/crm/pipeline')}>
              Pipeline
            </Button>
            <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => navigate('/crm/leads/new')}>
              Add Lead
            </Button>
          </>
        }
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Input label="From" type="date" max={dateTo || undefined} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label="To" type="date" min={dateFrom || undefined} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Select
            label="Pipeline"
            value={pipelineId}
            onChange={(e) => { setPipelineId(e.target.value); setStageGroupId('all'); }}
            options={[
              { value: 'all', label: 'All Pipelines' },
              ...pipelines.map((p) => ({ value: p.id, label: p.name })),
              { value: 'none', label: 'Not on any pipeline' },
            ]}
          />
          <Select
            label="Ad form"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            hint="Each ad runs its own lead form."
            options={[
              { value: 'all', label: 'All Forms' },
              ...(adSources?.forms ?? []).map((f) => ({ value: f.name, label: `${f.name} (${f.count})` })),
            ]}
          />
          <Select
            label="Assigned To"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            options={[{ value: 'all', label: 'Anyone' }, ...assigneeOptions(assignableUsers)]}
          />
          <Select
            label="Stage"
            value={stageGroupId}
            onChange={(e) => setStageGroupId(e.target.value)}
            disabled={!stageData?.grouped}
            hint={
              stageData && !stageData.grouped
                ? 'Set up stage groups for this pipeline to filter by them.'
                : undefined
            }
            options={[
              { value: 'all', label: 'All Stages' },
              ...(stageData?.grouped
                ? stageData.stages.map((st) => ({ value: st.id as string, label: st.name }))
                : []),
            ]}
          />
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              disabled={!hasFilters}
              onClick={() => {
                setDateFrom(''); setDateTo(''); setPipelineId('all');
                setFormName('all'); setAssignedUserId('all'); setStageGroupId('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      {statsLoading || !stats ? (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Leads" value={stats.totalLeads} icon={Users} tone="brand" onClick={() => navigate('/crm/leads')} />
          <StatCard label="New Today" value={stats.newToday} icon={UserPlus} tone="info" onClick={() => { const t = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); const d = t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate()); navigate("/crm/leads?dateFrom="+d+"&dateTo="+d); }} />
          <StatCard label="New This Week" value={stats.newThisWeek} tone="info" onClick={() => { const t = new Date(); const w = new Date(t); w.setDate(t.getDate()-6); const pad = (n: number) => String(n).padStart(2, "0"); const df = w.getFullYear()+"-"+pad(w.getMonth()+1)+"-"+pad(w.getDate()); const dt = t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate()); navigate("/crm/leads?dateFrom="+df+"&dateTo="+dt); }} />
          <StatCard label="Active in Pipeline" value={stats.activeInPipeline} icon={Target} tone="warning" onClick={() => navigate('/crm/leads?status=active')} />
          <StatCard label="Conversion Rate" value={`${stats.conversionRate}%`} icon={TrendingUp} tone="success" onClick={() => navigate("/crm/leads?status=won")} />
          <StatCard label="Won Deals" value={stats.wonDeals} icon={Trophy} tone="accent" footer={stats.wonValue == null ? undefined : formatCurrency(stats.wonValue)} onClick={() => navigate("/crm/leads?status=won")} />
        </div>
      )}

      <div className="mb-6">
        <ChartCard
          title="Stage Breakdown"
          subtitle={
            stageData?.pipelineName
              ? stageData.grouped
                ? `Leads by stage group in ${stageData.pipelineName}`
                : `Leads by stage in ${stageData.pipelineName} — no groups set up yet`
              : 'Pick a pipeline to see its stages'
          }
        >
          {stageData && stageData.stages.length > 0 ? (
            <>
              <SimpleBarChart
                data={stageData.stages}
                horizontal
                height={Math.max(180, stageData.stages.length * 42)}
                valueFormatter={(v) => `${v} (${stagePct(v, stageTotal)}%)`}
              />
              {/* The share of the pipeline each stage holds, read off the chart rather than
                  hovered for — the same shape the Status Breakdown's legend already uses. */}
              <div className="mt-4 space-y-1.5 border-t border-line pt-4">
                {stageData.stages.map((st) => (
                  <div key={st.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: st.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{st.name}</span>
                    <span className="font-medium text-ink">{st.value}</span>
                    <span className="w-14 text-right text-xs text-ink-faint">({stagePct(st.value, stageTotal)}%)</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 border-t border-line pt-2 text-sm">
                  <span className="h-2 w-2 shrink-0" />
                  <span className="min-w-0 flex-1 font-medium text-ink">Total</span>
                  <span className="font-semibold text-ink">{stageTotal}</span>
                  <span className="w-14 text-right text-xs text-ink-faint">(100%)</span>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">
              {pipelineId === 'none'
                ? 'These leads are on no pipeline, so there are no stages to break down.'
                : 'No stages to show for this pipeline.'}
            </p>
          )}
        </ChartCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title="Lead Creation Trend"
            subtitle={dateFrom || dateTo ? 'New leads in the selected window' : 'New leads over the last 14 days'}
          >
            {trend && <TrendAreaChart data={trend} xKey="date" yKey="leads" />}
          </ChartCard>
        </div>
        <ChartCard title="Status Breakdown" subtitle="Where leads stand right now">{statusData && <DonutChart data={statusData} />}</ChartCard>
      </div>

      {(canSeeLeads || canSeeFollowUps) && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {canSeeLeads && (
            <Card padded={false}>
              <div className="p-5 pb-0">
                <CardHeader title="Recent Leads" action={<Button variant="ghost" size="sm" onClick={() => navigate('/crm/leads')}>View all</Button>} />
              </div>
              <div className="divide-y divide-line">
                {recentLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-subtle"
                  >
                    <Avatar name={leadFullName(lead)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{leadFullName(lead)}</p>
                      <p className="text-xs text-ink-faint">{formatDate(lead.createdAt)}</p>
                    </div>
                    <LeadSourceBadge source={lead.source} otherSource={lead.otherSource} />
                    <StatusBadge kind="leadStatus" status={lead.status} dot={false} />
                  </button>
                ))}
              </div>
            </Card>
          )}
          {canSeeFollowUps && (
            <Card padded={false}>
              <div className="p-5 pb-0">
                <CardHeader
                  title="Overdue Follow-ups"
                  action={
                    <Button variant="ghost" size="sm" leftIcon={<CalendarClock size={13} />} onClick={() => navigate('/crm/follow-ups')}>
                      View all
                    </Button>
                  }
                />
              </div>
              {!overdue || overdue.items.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-muted">No overdue follow-ups. Nice work.</p>
              ) : (
                <div className="divide-y divide-line">
                  {overdue.items.map((t) => (
                    <button key={t.id} onClick={() => navigate(`/crm/leads/${t.leadId}`)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-surface-subtle">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                        {t.leadName && <p className="text-xs text-ink-faint">{t.leadName}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-danger-600">{formatDate(t.dueAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {sourceRows && sourceRows.length > 0 && (
        <div className="mt-6">
          <ChartCard title="Top Sources" subtitle="Where leads are coming from">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {sourceRows.slice(0, 6).map((s) => (
                <div key={s.source} className="rounded-lg border border-line p-3 text-center">
                  <p className="text-xl font-semibold text-ink">{s.total}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{s.label}</p>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
