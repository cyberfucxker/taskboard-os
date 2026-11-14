import { type ReactNode, useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Download, Filter, MoonStar, Pencil, Plus, Star, Trash2, Upload, X, Zap } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Drawer } from '../../components/ui/Drawer';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { Pagination } from '../../components/ui/Pagination';
import { DataTable, type DataTableColumn } from '../../components/tables/DataTable';
import { FilterBar } from '../../components/tables/FilterBar';
import { LeadSourceBadge } from '../../components/leads/LeadSourceBadge';
import { StagePicker } from '../../components/leads/StagePicker';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  listLeads, listAssignableUsers, listSourceOptions, toggleStar, deleteLead,
  bulkEditLeads, bulkDelete,
  type BulkEditChanges,
  listLeadIds,
  listAdSources,
  type LeadListParams,
  LEAD_STATUS_OPTIONS,
  LEAD_PRIORITY_OPTIONS,
} from '../../services/leadService';
import { listManualAutomations, runAutomationOnLeads } from '../../services/leadAutomationService';
import { enrollLeadsInSdrAgent, listSdrAgents } from '../../services/aiSdrService';
import { usePipelineReferenceData } from '../../hooks/usePipelineReferenceData';
import { exportToCsv } from '../../services/reportService';
import { formatDate, formatTime, leadFullName } from '../../utils/format';
import type { Automation, Lead, LeadPriority, LeadSource, LeadStatus } from '../../types';

/**
 * The fields the Bulk edit drawer can set. Each is off until it is ticked, and an untouched
 * field is never sent — which is what makes "change the stage without touching the owner" a
 * thing you can express at all.
 */
const EDIT_FIELDS = ['stage', 'assign', 'status', 'priority', 'source', 'add_tag', 'remove_tag'] as const;
type EditField = (typeof EDIT_FIELDS)[number];

interface EditValues {
  pipelineId: string;
  stageId: string;
  assignedUserId: string;
  status: string;
  priority: string;
  source: string;
  otherSource: string;
  addTagId: string;
  removeTagId: string;
}
const BLANK_EDIT: EditValues = {
  pipelineId: '', stageId: '', assignedUserId: '', status: '', priority: '',
  source: '', otherSource: '', addTagId: '', removeTagId: '',
};

/** The server caps a page at 100, so the picker must not offer more. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const UNASSIGNED = 'none';
const NO_PIPELINE = 'none';
const NO_STAGE = 'none';

function prettyMoment(value: string): string {
  if (!value) return 'any';
  const [date, time] = value.split('T');
  const [y, m, d] = date.split('-');
  return time ? `${d}/${m}/${y} ${time.slice(0, 5)}` : `${d}/${m}/${y}`;
}


export function LeadList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { session } = useAuth();
  const perms = usePermissions();
  const { pipelines, stages, tags, stageById, stagesForPipeline } = usePipelineReferenceData();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem('crm.leads.pageSize'));
    return PAGE_SIZE_OPTIONS.includes(saved) ? saved : 10;
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [priority, setPriority] = useState<LeadPriority | 'all'>('all');
  const [source, setSource] = useState('all');
  const [pipelineId, setPipelineId] = useState('all');
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [campaignName, setCampaignName] = useState('all');
  const [adName, setAdName] = useState('all');
  const [formName, setFormName] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const sp = searchParams;
    const s = sp.get('status');
    const df = sp.get('dateFrom');
    const dt = sp.get('dateTo');
    if (s) setStatus(s as LeadStatus | 'all');
    if (df) setDateFrom(df);
    if (dt) setDateTo(dt);
  }, []);
  const [lastActivityFrom, setLastActivityFrom] = useState('');
  const [lastActivityTo, setLastActivityTo] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const [bulkModal, setBulkModal] = useState<'run_automation' | 'enroll_sdr' | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editFields, setEditFields] = useState<Set<EditField>>(new Set());
  const [edit, setEdit] = useState<EditValues>(BLANK_EDIT);
  const [editBusy, setEditBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowDeleteTarget, setRowDeleteTarget] = useState<Lead | null>(null);
  const [manualAutomations, setManualAutomations] = useState<Automation[]>([]);
  const [sdrAgents, setSdrAgents] = useState<{ id: string; name: string; active: boolean }[]>([]);

  const debouncedSearch = useDebounce(search, 300);
  const assignableUsers = listAssignableUsers();

  const params: LeadListParams = {
    page,
    pageSize,
    search: debouncedSearch,
    status,
    priority,
    source: source as LeadListParams['source'],
    pipelineId,
    stageId: stageIds.length > 0 ? stageIds.join(',') : undefined,
    assignedUserId: assignedUserIds.length > 0 ? assignedUserIds.join(',') : undefined,
    starred: starredOnly || undefined,
    campaignName,
    adName,
    formName,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    lastActivityFrom: lastActivityFrom || undefined,
    lastActivityTo: lastActivityTo || undefined,
    sortBy,
    sortDir,
  };

  const { data, isLoading, error } = useAsync(() => listLeads(params), [JSON.stringify(params), reloadKey]);
  const { data: adSources } = useAsync(() => listAdSources().catch(() => undefined), [reloadKey]);

  const stagesForSelectedPipeline = pipelineId !== 'all' ? stagesForPipeline(pipelineId) : [];
  const stagesForStageFilter = pipelineId !== 'all' ? stagesForSelectedPipeline : stages;
  const toggleStage = (id: string) => {
    setStageIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    setPage(1);
  };
  const toggleAssignee = (id: string) => {
    setAssignedUserIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
    setPage(1);
  };

  const hasActiveFilters = useMemo(
    () => !!(search || status !== 'all' || priority !== 'all' || source !== 'all' || pipelineId !== 'all' || stageIds.length > 0 || assignedUserIds.length > 0 || starredOnly || campaignName !== 'all' || adName !== 'all' || formName !== 'all' || dateFrom || dateTo || lastActivityFrom || lastActivityTo),
    [search, status, priority, source, pipelineId, stageIds, assignedUserIds, starredOnly, campaignName, adName, formName, dateFrom, dateTo, lastActivityFrom, lastActivityTo]
  );

  const resetFilters = () => {
    setSearch(''); setStatus('all'); setPriority('all'); setSource('all');
    setPipelineId('all'); setStageIds([]); setAssignedUserIds([]); setStarredOnly(false);
    setDateFrom(''); setDateTo(''); setLastActivityFrom(''); setLastActivityTo('');
    setPage(1);
  };

  const activeFilterChips = [
    status !== 'all' && { key: 'status', label: `Status: ${status}`, clear: () => setStatus('all') },
    priority !== 'all' && { key: 'priority', label: `Priority: ${priority}`, clear: () => setPriority('all') },
    source !== 'all' && { key: 'source', label: `Source: ${listSourceOptions().find((s) => s.value === source)?.label ?? source}`, clear: () => setSource('all') },
    pipelineId !== 'all' && {
      key: 'pipeline',
      label: pipelineId === NO_PIPELINE ? 'Not on any pipeline' : `Pipeline: ${pipelines.find((p) => p.id === pipelineId)?.name}`,
      clear: () => { setPipelineId('all'); setStageIds([]); },
    },
    stageIds.length > 0 && {
      key: 'stage',
      label: stageIds.length === 1
        ? stageIds[0] === NO_STAGE ? 'Not on any stage' : `Stage: ${stageById(stageIds[0])?.name}`
        : `${stageIds.length} stages`,
      clear: () => setStageIds([]),
    },
    assignedUserIds.length > 0 && {
      key: 'assignee',
      label: assignedUserIds.length === 1
        ? assignedUserIds[0] === UNASSIGNED ? 'Unassigned' : `Assigned: ${assignableUsers.find((u) => u.id === assignedUserIds[0])?.name}`
        : `${assignedUserIds.length} assignees`,
      clear: () => setAssignedUserIds([]),
    },
    starredOnly && { key: 'starred', label: 'Starred only', clear: () => setStarredOnly(false) },
    campaignName !== 'all' && { key: 'campaign', label: `Campaign: ${campaignName}`, clear: () => setCampaignName('all') },
    adName !== 'all' && { key: 'ad', label: `Ad: ${adName}`, clear: () => setAdName('all') },
    formName !== 'all' && { key: 'form', label: `Form: ${formName}`, clear: () => setFormName('all') },
    (dateFrom || dateTo) && {
      key: 'created',
      label: `Created: ${dateFrom || 'any'} → ${dateTo || 'any'}`,
      clear: () => { setDateFrom(''); setDateTo(''); },
    },
    (lastActivityFrom || lastActivityTo) && {
      key: 'lastActivity',
      label: `Last activity: ${prettyMoment(lastActivityFrom)} → ${prettyMoment(lastActivityTo)}`,
      clear: () => { setLastActivityFrom(''); setLastActivityTo(''); },
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const handleSortChange = (key: string) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = (data?.items.length ?? 0) > 0 && data!.items.every((l) => selectedIds.has(l.id));
  const allMatchingSelected = !!data && selectedIds.size >= data.total;
  const [selectingAll, setSelectingAll] = useState(false);

  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const { ids, total, capped, limit } = await listLeadIds(params);
      setSelectedIds(new Set(ids));
      toast({
        title: `${ids.length} leads selected`,
        description: capped ? `The filter matches ${total}, and a bulk action takes ${limit} at a time. Narrow it to reach the rest.` : undefined,
        variant: capped ? 'warning' : 'success',
      });
    } catch (err) {
      toast({ title: 'Could not select them all', description: err instanceof Error ? err.message : undefined, variant: 'error' });
    } finally {
      setSelectingAll(false);
    }
  };

  const toggleSelectAll = () => {
    if (!data) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) data.items.forEach((l) => next.delete(l.id));
      else data.items.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const openBulkEdit = () => { setEditFields(new Set()); setEdit(BLANK_EDIT); setEditOpen(true); };
  const toggleEditField = (field: EditField) => {
    setEditFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });
  };

  const editIncomplete =
    (editFields.has('stage') && !edit.stageId) ||
    (editFields.has('assign') && !edit.assignedUserId) ||
    (editFields.has('status') && !edit.status) ||
    (editFields.has('priority') && !edit.priority) ||
    (editFields.has('source') && !edit.source) ||
    (editFields.has('add_tag') && !edit.addTagId) ||
    (editFields.has('remove_tag') && !edit.removeTagId);

  const editSummary = [
    editFields.has('stage') && edit.stageId && `Stage: ${stageById(edit.stageId)?.name}`,
    editFields.has('status') && edit.status && `Status: ${LEAD_STATUS_OPTIONS.find((o) => o.value === edit.status)?.label}`,
    editFields.has('priority') && edit.priority && `Priority: ${LEAD_PRIORITY_OPTIONS.find((o) => o.value === edit.priority)?.label}`,
    editFields.has('source') && edit.source && `Source: ${listSourceOptions().find((o) => o.value === edit.source)?.label}`,
    editFields.has('add_tag') && edit.addTagId && `+ tag ${tags.find((t) => t.id === edit.addTagId)?.name}`,
    editFields.has('remove_tag') && edit.removeTagId && `− tag ${tags.find((t) => t.id === edit.removeTagId)?.name}`,
    editFields.has('assign') && edit.assignedUserId &&
      (edit.assignedUserId === UNASSIGNED ? 'Unassigned' : `Assigned to ${assignableUsers.find((u) => u.id === edit.assignedUserId)?.name}`),
  ].filter(Boolean) as string[];

  const runBulkEdit = async () => {
    const ids = Array.from(selectedIds);
    const changes: BulkEditChanges = {};
    if (editFields.has('stage') && edit.stageId) { changes.pipelineId = edit.pipelineId; changes.stageId = edit.stageId; }
    if (editFields.has('status') && edit.status) changes.status = edit.status as LeadStatus;
    if (editFields.has('priority') && edit.priority) changes.priority = edit.priority as LeadPriority;
    if (editFields.has('source') && edit.source) { changes.source = edit.source as LeadSource; if (edit.source === 'other') changes.otherSource = edit.otherSource; }
    if (editFields.has('add_tag') && edit.addTagId) changes.addTagId = edit.addTagId;
    if (editFields.has('remove_tag') && edit.removeTagId) changes.removeTagId = edit.removeTagId;
    if (editFields.has('assign') && edit.assignedUserId) {
      changes.assignedUserId = edit.assignedUserId === UNASSIGNED ? null : edit.assignedUserId;
    }

    setEditBusy(true);
    try {
      const result = await bulkEditLeads(ids, changes);
      toast({ title: `${result.updated} lead(s) updated`, description: editSummary.join(' · '), variant: 'success' });
      setEditOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast({ title: 'Nothing was changed', description: (err as Error).message, variant: 'error' });
    } finally {
      setEditBusy(false);
    }
  };

  const openBulkModal = async (modal: NonNullable<typeof bulkModal>) => {
    setBulkModal(modal); setBulkValue('');
    if (modal === 'run_automation') setManualAutomations(await listManualAutomations());
    if (modal === 'enroll_sdr') setSdrAgents((await listSdrAgents()).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, active: a.active })));
  };

  const runBulkAction = async () => {
    const ids = Array.from(selectedIds);
    if (bulkModal === 'enroll_sdr' && bulkValue) {
      const result = await enrollLeadsInSdrAgent(bulkValue, ids);
      toast({ title: `${result.enrolled} lead(s) enrolled`, description: result.skipped > 0 ? `${result.skipped} skipped — already enrolled with this agent.` : undefined, variant: 'success' });
    } else if (bulkModal === 'run_automation' && bulkValue) {
      const result = await runAutomationOnLeads(bulkValue, ids);
      toast({ title: `Automation queued for ${result.queued} lead(s)`, description: result.skipped > 0 ? `${result.skipped} lead(s) were skipped (already assigned, or no eligible assignee).` : undefined, variant: 'success' });
    }
    setBulkModal(null); setBulkValue(''); setSelectedIds(new Set()); setReloadKey((k) => k + 1);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await bulkDelete(ids);
    toast({ title: `${ids.length} lead(s) deleted`, variant: 'success' });
    setSelectedIds(new Set()); setReloadKey((k) => k + 1);
  };

  const handleToggleStar = async (lead: Lead) => { await toggleStar(lead.id); setReloadKey((k) => k + 1); };

  const handleRowDelete = async () => {
    if (!rowDeleteTarget) return;
    await deleteLead(rowDeleteTarget.id);
    toast({ title: 'Lead deleted', variant: 'success' });
    setRowDeleteTarget(null); setReloadKey((k) => k + 1);
  };

  const handleExport = () => {
    exportToCsv('leads.csv', (data?.items ?? []).map((l) => ({
      id: l.id, name: leadFullName(l), phone: l.phone, email: l.email ?? '',
      source: l.source, status: l.status, priority: l.priority, dealValue: l.dealValue ?? '', createdAt: l.createdAt,
    })));
  };

  const columns: DataTableColumn<Lead>[] = [
    {
      key: 'select',
      header: (
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all leads on this page" className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
      ),
      width: '40px',
      render: (l) => (
        <input type="checkbox" checked={selectedIds.has(l.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelected(l.id)} aria-label={`Select ${leadFullName(l)}`} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
      ),
    },
    {
      key: 'name',
      header: 'Lead',
      sortable: true,
      render: (l) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={leadFullName(l)} size="sm" />
          <Link to={`/crm/leads/${l.id}`} onClick={(e) => e.stopPropagation()} className="min-w-0 rounded focus-ring">
            <p className="flex items-center gap-1 font-medium text-ink">
              {leadFullName(l)}
              {l.isStarred && <Star size={12} className="fill-accent-500 text-accent-500" />}
              {l.receivedOutsideBusinessHours && <MoonStar size={12} className="text-navy-400" aria-label="Received outside business hours" />}
            </p>
            <p className="text-xs text-ink-faint">{l.phone}</p>
          </Link>
        </div>
      ),
    },
    { key: 'source', header: 'Source', sortable: true, render: (l) => <LeadSourceBadge source={l.source} otherSource={l.otherSource} /> },
    { key: 'status', header: 'Status', sortable: true, render: (l) => <StatusBadge kind="leadStatus" status={l.status} /> },
    { key: 'priority', header: 'Priority', sortable: true, render: (l) => <StatusBadge kind="leadPriority" status={l.priority} dot={false} /> },
    {
      key: 'stage',
      header: 'Pipeline Stage',
      sortable: true,
      render: (l) => {
        const stage = l.pipelineStageId ? stageById(l.pipelineStageId) : undefined;
        const stageBadge = stage ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
            {stage.name}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">Unassigned</span>
        );

        if (!perms.canMoveStage) return stageBadge;

        return (
          <StagePicker
            pipelineId={(l as any).pipelineId ?? undefined}
            stageId={l.pipelineStageId ?? undefined}
            pipelines={pipelines}
            stagesForPipeline={stagesForPipeline}
            onChange={async (pid, sid) => {
              await bulkEditLeads([l.id], { pipelineId: pid, stageId: sid });
              setReloadKey((k) => k + 1);
            }}
          >
            <div className="cursor-pointer rounded px-1 py-0.5 hover:bg-surface-muted">{stageBadge}</div>
          </StagePicker>
        );
      },
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (l) => {
        const user = assignableUsers.find((u) => u.id === l.assignedUserId);
        return user ? user.name : l.assignedTo ? <span className="text-ink-faint">{l.assignedTo}</span> : <span className="text-ink-faint">Unassigned</span>;
      },
    },
    { key: 'nextFollowUpAt', header: 'Next Follow-up', sortable: true, render: (l) => (l.nextFollowUpAt ? formatDate(l.nextFollowUpAt) : '—') },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (l) => (
        <span className="whitespace-nowrap">
          {formatDate(l.createdAt)}
          <span className="block text-xs text-ink-faint">{formatTime(l.createdAt)}</span>
        </span>
      ),
    },
    {
      key: 'lastActivity',
      header: 'Last Activity',
      sortable: true,
      render: (l) =>
        l.lastActivity ? (
          <span className="whitespace-nowrap" title={l.lastActivity.description}>
            {formatDate(l.lastActivity.at)}
            <span className="block text-xs text-ink-faint">{formatTime(l.lastActivity.at)}</span>
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (l) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {perms.canToggleStar && (
            <button type="button" onClick={() => handleToggleStar(l)} aria-label={l.isStarred ? 'Unstar lead' : 'Star lead'} className="rounded p-1.5 text-ink-faint hover:bg-surface-muted hover:text-accent-500 focus-ring">
              <Star size={14} className={l.isStarred ? 'fill-accent-500 text-accent-500' : ''} />
            </button>
          )}
          {perms.canDeleteLead && (
            <button type="button" onClick={() => setRowDeleteTarget(l)} aria-label="Delete lead" className="rounded p-1.5 text-ink-faint hover:bg-danger-50 hover:text-danger-600 focus-ring">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="All incoming leads across every source, pipeline and stage."
        breadcrumb={[{ label: 'CRM', to: '/crm' }, { label: 'Leads' }]}
        actions={
          <>
            {perms.canImport && (
              <Button variant="outline" leftIcon={<Upload size={14} />} onClick={() => navigate('/crm/leads/import')}>Import</Button>
            )}
            {perms.canExport && (
              <Button variant="outline" leftIcon={<Download size={14} />} onClick={handleExport}>Export</Button>
            )}
            {perms.canCreateLead && (
              <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => navigate('/crm/leads/new')}>Add Lead</Button>
            )}
          </>
        }
      />

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          {allVisibleSelected && !allMatchingSelected && (data?.total ?? 0) > selectedIds.size && (
            <button type="button" onClick={selectAllMatching} disabled={selectingAll} className="text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-ring disabled:opacity-60">
              {selectingAll ? 'Selecting…' : `Select all ${data?.total} matching this filter`}
            </button>
          )}
          {allMatchingSelected && (
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-ring">
              Clear selection
            </button>
          )}
          {perms.canBulkEdit && (
            <Button variant="primary" size="sm" leftIcon={<Pencil size={13} />} onClick={openBulkEdit}>Bulk edit</Button>
          )}
          <Button variant="outline" size="sm" leftIcon={<Bot size={13} />} onClick={() => openBulkModal('enroll_sdr')}>Enroll in AI SDR</Button>
          <Button variant="outline" size="sm" leftIcon={<Zap size={13} />} onClick={() => openBulkModal('run_automation')}>Run Automation</Button>
          {perms.canBulkDelete && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 size={13} />} onClick={() => setBulkDeleteOpen(true)}>Delete</Button>
          )}
          <Button variant="ghost" size="sm" leftIcon={<X size={13} />} onClick={() => setSelectedIds(new Set())} className="ml-auto">Clear selection</Button>
        </div>
      )}

      <Card padded={false}>
        <FilterBar
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder="Search by name, phone, email or lead ID..."
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
          actions={
            <Button variant="outline" leftIcon={<Filter size={14} />} onClick={() => setFiltersOpen(true)}>
              Filters {hasActiveFilters && `(${activeFilterChips.length})`}
            </Button>
          }
        />

        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            {activeFilterChips.map((chip) => (
              <button key={chip.key} onClick={() => { chip.clear(); setPage(1); }} className="flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-hover">
                {chip.label}<X size={11} />
              </button>
            ))}
          </div>
        )}

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(l) => l.id}
          isLoading={isLoading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          onRowClick={(l) => navigate(`/crm/leads/${l.id}`)}
          rowHref={(l) => `/crm/leads/${l.id}`}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          emptyTitle="No leads found"
          emptyDescription="Try adjusting your filters, or add a new lead."
        />

        {data && data.total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            onPageChange={setPage}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); localStorage.setItem('crm.leads.pageSize', String(size)); }}
          />
        )}
      </Card>

      <Drawer isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-4">
          <Select label="Lead Status" value={status} onChange={(e) => { setStatus(e.target.value as LeadStatus | 'all'); setPage(1); }} options={LEAD_STATUS_OPTIONS} />
          <Select label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value as LeadPriority | 'all'); setPage(1); }} options={LEAD_PRIORITY_OPTIONS} />
          <Select
            label="Ad form" value={formName}
            onChange={(e) => { setFormName(e.target.value); setPage(1); }}
            options={[{ value: 'all', label: 'All Forms' }, ...(adSources?.forms ?? []).map((f) => ({ value: f.name, label: `${f.name} (${f.count})` }))]}
            hint="Each ad runs its own lead form, so this is the closest thing to filtering by ad."
          />
          {(adSources?.campaigns.length ?? 0) > 0 && (
            <Select label="Ad campaign" value={campaignName} onChange={(e) => { setCampaignName(e.target.value); setPage(1); }}
              options={[{ value: 'all', label: 'All Campaigns' }, ...(adSources?.campaigns ?? []).map((c) => ({ value: c.name, label: `${c.name} (${c.count})` }))]} />
          )}
          {(adSources?.ads.length ?? 0) > 0 && (
            <Select label="Ad" value={adName} onChange={(e) => { setAdName(e.target.value); setPage(1); }}
              options={[{ value: 'all', label: 'All Ads' }, ...(adSources?.ads ?? []).map((a) => ({ value: a.name, label: `${a.name} (${a.count})` }))]} />
          )}
          <Select label="Source" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}
            options={[{ value: 'all', label: 'All Sources' }, ...listSourceOptions()]} />
          <Select
            label="Pipeline" value={pipelineId}
            onChange={(e) => { setPipelineId(e.target.value); setStageIds([]); setPage(1); }}
            options={[
              { value: 'all', label: 'All Pipelines' },
              ...pipelines.map((p) => ({ value: p.id, label: p.name })),
              { value: NO_PIPELINE, label: 'Not on any pipeline' },
            ]}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Pipeline Stage</p>
            {pipelineId === NO_PIPELINE ? (
              <p className="text-xs text-ink-faint">These leads are on no pipeline, so there is no stage to narrow by.</p>
            ) : (
              <>
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-2.5">
                  <label className="flex items-center gap-2 text-sm text-ink-muted">
                    <input type="checkbox" checked={stageIds.includes(NO_STAGE)} onChange={() => toggleStage(NO_STAGE)} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
                    Not on any stage
                  </label>
                  {stagesForStageFilter.map((st) => (
                    <label key={st.id} className="flex items-center gap-2 text-sm text-ink-muted">
                      <input type="checkbox" checked={stageIds.includes(st.id)} onChange={() => toggleStage(st.id)} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: st.color }} />
                      <span className="truncate">{st.name}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {stageIds.length === 0 ? 'All stages.' : `${stageIds.length} selected.`}
                  {pipelineId === 'all' ? ' Pick a pipeline to list its stages.' : ''}
                </p>
              </>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Assigned To</p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-2.5">
              {assignableUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={assignedUserIds.includes(u.id)} onChange={() => toggleAssignee(u.id)} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
              {session?.isFullAccess && (
                <label className="flex items-center gap-2 border-t border-line pt-1.5 text-sm text-ink-muted">
                  <input type="checkbox" checked={assignedUserIds.includes(UNASSIGNED)} onChange={() => toggleAssignee(UNASSIGNED)} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
                  Unassigned (nobody)
                </label>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">{assignedUserIds.length === 0 ? 'Anyone.' : `${assignedUserIds.length} selected.`}</p>
          </div>
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">Created</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="date" max={dateTo || undefined} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              <Input label="To" type="date" min={dateFrom || undefined} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Last activity</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="datetime-local" max={lastActivityTo || undefined} value={lastActivityFrom} onChange={(e) => { setLastActivityFrom(e.target.value); setPage(1); }} />
              <Input label="To" type="datetime-local" min={lastActivityFrom || undefined} value={lastActivityTo} onChange={(e) => { setLastActivityTo(e.target.value); setPage(1); }} />
            </div>
            <p className="text-xs text-ink-faint">Times are read in IST, and the minute you pick is included at both ends.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={starredOnly} onChange={(e) => { setStarredOnly(e.target.checked); setPage(1); }} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
            Starred only
          </label>
          <div className="flex gap-2 border-t border-line pt-4">
            <Button variant="outline" className="flex-1" onClick={resetFilters}>Clear all</Button>
            <Button variant="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>Apply</Button>
          </div>
        </div>
      </Drawer>

      <Drawer isOpen={editOpen} onClose={() => setEditOpen(false)} title="Bulk edit">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Tick what should change. {selectedIds.size} lead(s) selected — anything you leave unticked is left alone.</p>

          <EditRow label="Stage" on={editFields.has('stage')} onToggle={() => toggleEditField('stage')}>
            <Select label="Pipeline" value={edit.pipelineId} onChange={(e) => setEdit((v) => ({ ...v, pipelineId: e.target.value, stageId: '' }))}
              options={[{ value: '', label: 'Select a pipeline' }, ...pipelines.map((pl) => ({ value: pl.id, label: pl.name }))]} />
            <Select label="Stage" value={edit.stageId} onChange={(e) => setEdit((v) => ({ ...v, stageId: e.target.value }))} disabled={!edit.pipelineId}
              hint={!edit.pipelineId ? 'Choose a pipeline first.' : undefined}
              options={edit.pipelineId ? [{ value: '', label: 'Select a stage' }, ...stagesForPipeline(edit.pipelineId).map((st) => ({ value: st.id, label: st.name }))] : [{ value: '', label: '—' }]} />
            {edit.stageId && (stageById(edit.stageId)?.isWon || stageById(edit.stageId)?.isLost) && (
              <p className="text-xs text-ink-faint">This stage also marks the leads as {stageById(edit.stageId)?.isWon ? 'Won' : 'Lost'}.</p>
            )}
          </EditRow>

          <EditRow label="Assign to" on={editFields.has('assign')} onToggle={() => toggleEditField('assign')}>
            <Select label="Owner" value={edit.assignedUserId} onChange={(e) => setEdit((v) => ({ ...v, assignedUserId: e.target.value }))}
              options={[{ value: '', label: 'Select a user' }, ...assignableUsers.map((u) => ({ value: u.id, label: u.name })), { value: UNASSIGNED, label: '— Unassign (remove owner) —' }]} />
            {edit.assignedUserId === UNASSIGNED && !session?.isFullAccess && (
              <p className="rounded-lg border border-warning-100 bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
                Unassigned leads are only visible to a full-access admin, so these will disappear from your list.
              </p>
            )}
          </EditRow>

          <EditRow label="Status" on={editFields.has('status')} onToggle={() => toggleEditField('status')}>
            <Select label="New status" value={edit.status} onChange={(e) => setEdit((v) => ({ ...v, status: e.target.value }))}
              options={[{ value: '', label: 'Select a status' }, ...LEAD_STATUS_OPTIONS.filter((o) => o.value !== 'all')]} />
          </EditRow>

          <EditRow label="Priority" on={editFields.has('priority')} onToggle={() => toggleEditField('priority')}>
            <Select label="New priority" value={edit.priority} onChange={(e) => setEdit((v) => ({ ...v, priority: e.target.value }))}
              options={[{ value: '', label: 'Select a priority' }, ...LEAD_PRIORITY_OPTIONS.filter((o) => o.value !== 'all')]} />
          </EditRow>

          <EditRow label="Source" on={editFields.has('source')} onToggle={() => toggleEditField('source')}>
            <Select label="New source" value={edit.source} onChange={(e) => setEdit((v) => ({ ...v, source: e.target.value }))}
              options={[{ value: '', label: 'Select a source' }, ...listSourceOptions()]} />
            {edit.source === 'other' && <Input label="Which source?" value={edit.otherSource} onChange={(e) => setEdit((v) => ({ ...v, otherSource: e.target.value }))} />}
          </EditRow>

          <EditRow label="Add tag" on={editFields.has('add_tag')} onToggle={() => toggleEditField('add_tag')}>
            <Select label="Tag" value={edit.addTagId} onChange={(e) => setEdit((v) => ({ ...v, addTagId: e.target.value }))}
              options={[{ value: '', label: 'Select a tag' }, ...tags.map((t) => ({ value: t.id, label: t.name }))]} />
          </EditRow>

          <EditRow label="Remove tag" on={editFields.has('remove_tag')} onToggle={() => toggleEditField('remove_tag')}>
            <Select label="Tag" value={edit.removeTagId} onChange={(e) => setEdit((v) => ({ ...v, removeTagId: e.target.value }))}
              options={[{ value: '', label: 'Select a tag' }, ...tags.map((t) => ({ value: t.id, label: t.name }))]} />
          </EditRow>

          <div className="rounded-lg border border-line bg-surface-subtle px-3 py-2.5">
            {editSummary.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing ticked yet.</p>
            ) : (
              <p className="text-sm text-ink"><span className="font-medium">{selectedIds.size} lead(s)</span> → {editSummary.join(', ')}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={runBulkEdit} disabled={editBusy || editSummary.length === 0 || editIncomplete}>
              {editBusy ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </div>
      </Drawer>

      <Drawer isOpen={bulkModal !== null} onClose={() => setBulkModal(null)} title={bulkModal === 'enroll_sdr' ? 'Enroll in AI SDR Agent' : 'Run Automation'}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">This will apply to {selectedIds.size} selected lead(s).</p>
          {bulkModal === 'enroll_sdr' && (
            <>
              <Select label="AI SDR Agent" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                options={[{ value: '', label: 'Select an agent' }, ...sdrAgents.map((a) => ({ value: a.id, label: a.name }))]} />
              {sdrAgents.length === 0 ? (
                <p className="text-xs text-ink-faint">No active agents. Create one under CRM → AI SDR Agents.</p>
              ) : (
                <p className="text-xs text-ink-faint">The agent's guardrails apply from the moment a lead is enrolled. Leads already enrolled with this agent are skipped.</p>
              )}
            </>
          )}
          {bulkModal === 'run_automation' && (
            <>
              <Select label="Automation" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                options={[{ value: '', label: 'Select an automation' }, ...manualAutomations.map((a) => ({ value: a.id, label: a.name }))]} />
              {manualAutomations.length === 0 && (
                <p className="text-xs text-ink-faint">No manually-triggerable automations are configured. Create one under CRM → Automation with trigger "Manual".</p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={runBulkAction} disabled={!bulkValue}>Apply</Button>
          </div>
        </div>
      </Drawer>

      <ConfirmationDialog
        isOpen={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => { await handleBulkDelete(); setBulkDeleteOpen(false); }}
        title="Delete selected leads"
        description={`This will delete ${selectedIds.size} selected lead(s). This action can be recovered by an administrator from the backend, but is not reversible from this screen.`}
        confirmLabel="Delete" variant="danger" audited
      />

      <ConfirmationDialog
        isOpen={!!rowDeleteTarget} onClose={() => setRowDeleteTarget(null)} onConfirm={handleRowDelete}
        title="Delete lead"
        description={rowDeleteTarget ? `This will delete "${leadFullName(rowDeleteTarget)}" (${rowDeleteTarget.id}).` : undefined}
        confirmLabel="Delete" variant="danger" audited
      />
    </div>
  );
}

/** One tickable field in the Bulk edit drawer: a checkbox, and its inputs once it is on. */
function EditRow({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`rounded-lg border p-3 ${on ? 'border-brand-200 bg-brand-50' : 'border-line'}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={on} onChange={onToggle} className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring" />
        {label}
      </label>
      {on && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
