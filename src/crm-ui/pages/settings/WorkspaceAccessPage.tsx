'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lock, Unlock, Users, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { CardSkeleton } from '../../components/ui/LoadingSkeleton';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/apiClient';
import { refUsers, type CrmUser } from '../../data/referenceData';

interface Pipeline {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  allowedUserIds: string[] | null;
  _count?: { leads: number };
}

async function fetchPipelines(): Promise<Pipeline[]> {
  return api.get<Pipeline[]>('/pipelines');
}

async function patchPipeline(id: string, allowedUserIds: string[] | null): Promise<void> {
  await api.patch<Pipeline>(`/pipelines/${id}`, { allowedUserIds });
}

function UserBadge({ user, onRemove }: { user: CrmUser; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
      {user.name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 rounded-full hover:text-brand-900 focus-ring">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

function PipelineRow({ pipeline, allUsers, onChange }: {
  pipeline: Pipeline;
  allUsers: CrmUser[];
  onChange: (id: string, allowedUserIds: string[] | null) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const isRestricted = Array.isArray(pipeline.allowedUserIds) && pipeline.allowedUserIds.length > 0;
  const allowedIds: string[] = isRestricted ? (pipeline.allowedUserIds as string[]) : [];

  const allowedUsers = allowedIds.map((id) => allUsers.find((u) => u.id === id)).filter(Boolean) as CrmUser[];
  const available = allUsers.filter((u) => !allowedIds.includes(u.id));

  const save = useCallback(async (next: string[] | null) => {
    setSaving(true);
    try {
      await patchPipeline(pipeline.id, next);
      onChange(pipeline.id, next);
      toast({ title: 'Pipeline access updated', variant: 'success' });
    } catch {
      toast({ title: 'Failed to update access', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [pipeline.id, onChange, toast]);

  const unrestrict = () => { void save(null); };
  const restrict = () => { void save([]); };
  const addUser = (userId: string) => { void save([...allowedIds, userId]); };
  const removeUser = (userId: string) => {
    const next = allowedIds.filter((id) => id !== userId);
    void save(next.length > 0 ? next : []);
  };

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-surface-muted">
          {isRestricted ? <Lock size={15} className="text-amber-600" /> : <Unlock size={15} className="text-ink-faint" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{pipeline.name}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {isRestricted
              ? `Restricted — ${allowedIds.length} user${allowedIds.length !== 1 ? 's' : ''} + leadership`
              : 'Open — all sales team members can see this pipeline'}
          </p>
        </div>
        {open ? <ChevronUp size={14} className="text-ink-faint" /> : <ChevronDown size={14} className="text-ink-faint" />}
      </button>

      {open && (
        <div className="border-t border-line px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isRestricted ? 'secondary' : 'ghost'}
              onClick={unrestrict}
              disabled={saving || !isRestricted}
            >
              <Unlock size={13} className="mr-1.5" />
              Open access
            </Button>
            <Button
              size="sm"
              variant={!isRestricted ? 'secondary' : 'ghost'}
              onClick={restrict}
              disabled={saving || isRestricted}
            >
              <Lock size={13} className="mr-1.5" />
              Restrict access
            </Button>
          </div>

          {isRestricted && (
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wide">
                  Allowed users (leadership always has access)
                </p>
                <div className="flex flex-wrap gap-2">
                  {allowedUsers.length === 0 && (
                    <p className="text-xs text-ink-faint italic">No users added yet — add from the list below</p>
                  )}
                  {allowedUsers.map((u) => (
                    <UserBadge key={u.id} user={u} onRemove={() => removeUser(u.id)} />
                  ))}
                </div>
              </div>

              {available.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wide">Add users</p>
                  <div className="flex flex-wrap gap-2">
                    {available.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={saving}
                        onClick={() => addUser(u.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50"
                      >
                        <Users size={10} />
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkspaceAccessPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchPipelines()
      .then(setPipelines)
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = useCallback((id: string, allowedUserIds: string[] | null) => {
    setPipelines((prev) =>
      prev.map((p) => (p.id === id ? { ...p, allowedUserIds } : p))
    );
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Workspace Access"
        description="Control which team members can see each pipeline. Leadership (SUPER_ADMIN / DEPARTMENT_HEAD) always retains full access."
      />

      {isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : pipelines.length === 0 ? (
        <p className="text-sm text-ink-muted">No pipelines found.</p>
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <PipelineRow
              key={p.id}
              pipeline={p}
              allUsers={refUsers}
              onChange={handleChange}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-800">
          <strong>Note:</strong> SUPER_ADMIN and DEPARTMENT_HEAD always bypass pipeline restrictions.
          Restricting a pipeline hides it (and its leads) from other team members unless they are explicitly added above.
        </p>
      </div>
    </div>
  );
}
