import { useState } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { CardSkeleton } from '../../components/ui/LoadingSkeleton';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../context/ToastContext';
import { usePipelineReferenceData } from '../../hooks/usePipelineReferenceData';
import {
  createStageGroup, deleteStageGroup, listStageGroups, updateStageGroup, type StageGroup,
} from '../../services/stageGroupService';

/**
 * CRM > Stage Groups.
 *
 * "NATC + Other + Disqualified, shown as Disqualified." Ten stages become seven lines on the
 * Overview without anything being renamed, merged or deleted — the Leads list, the Kanban
 * board and the pipeline itself keep working on the real stages.
 */
export function StageGroups() {
  const { toast } = useToast();
  const { pipelines, isLoading: pipelinesLoading } = usePipelineReferenceData();
  const [pipelineId, setPipelineId] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Falls to the first pipeline once they load, so the page is never a dropdown and nothing.
  const activePipelineId = pipelineId || pipelines[0]?.id || '';
  const { data, isLoading } = useAsync(
    () => (activePipelineId ? listStageGroups(activePipelineId) : Promise.resolve({ groups: [], stages: [] })),
    [activePipelineId, reloadKey]
  );

  const [editing, setEditing] = useState<StageGroup | 'new' | null>(null);
  const [name, setName] = useState('');
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StageGroup | null>(null);

  const openCreate = () => {
    setName('');
    setStageIds([]);
    setEditing('new');
  };

  const openEdit = (group: StageGroup) => {
    setName(group.name);
    setStageIds(group.stages.map((s) => s.id));
    setEditing(group);
  };

  const toggleStage = (id: string) => {
    setStageIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!name.trim() || stageIds.length === 0) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await createStageGroup({ pipelineId: activePipelineId, name: name.trim(), stageIds });
        toast({ title: 'Group created', variant: 'success' });
      } else if (editing) {
        await updateStageGroup(editing.id, { name: name.trim(), stageIds });
        toast({ title: 'Group updated', variant: 'success' });
      }
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast({
        title: 'Could not save the group',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteStageGroup(confirmDelete.id);
      toast({ title: 'Group deleted', description: 'The stages themselves are untouched.', variant: 'success' });
      setConfirmDelete(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast({
        title: 'Could not delete the group',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const groups = data?.groups ?? [];
  const stages = data?.stages ?? [];
  // A stage already in another group cannot be ticked here — the server refuses it, so the
  // form says so rather than accepting the tick and failing on save.
  const takenByOther = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage?.groupId) return null;
    if (editing !== 'new' && editing?.id === stage.groupId) return null;
    return groups.find((g) => g.id === stage.groupId)?.name ?? 'another group';
  };
  const ungrouped = stages.filter((s) => !s.groupId);

  return (
    <div>
      <PageHeader
        title="Stage Groups"
        description="Combine stages into the lines you want the CRM Overview's breakdown to show. Nothing is renamed or merged — the Leads list, Kanban and the pipeline keep working on the real stages."
        breadcrumb={[{ label: 'CRM', to: '/crm' }, { label: 'Stage Groups' }]}
        actions={
          <Button variant="primary" leftIcon={<Plus size={15} />} disabled={!activePipelineId} onClick={openCreate}>
            Add Group
          </Button>
        }
      />

      <Card className="mb-5">
        <Select
          label="Pipeline"
          wrapperClassName="max-w-sm"
          value={activePipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
          hint="Each pipeline has its own groups."
        />
      </Card>

      {pipelinesLoading || isLoading ? (
        <CardSkeleton />
      ) : (
        <>
          <Card padded={false} className="mb-5">
            <CardHeader
              title={`${groups.length} group(s)`}
              subtitle="Shown on the Overview in this order — the order they were created in."
            />
            {groups.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-ink-faint">
                No groups yet, so the Overview shows this pipeline's stages as they are.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {groups.map((g, i) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="w-6 shrink-0 text-sm font-medium text-ink-faint">{i + 1}</span>
                    <Layers size={16} className="shrink-0 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{g.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.stages.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-subtle px-2 py-0.5 text-xs text-ink-muted"
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(g)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(g)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {groups.length > 0 && ungrouped.length > 0 && (
            <Card>
              <CardHeader
                title="Not in any group"
                subtitle="These are left out of the Overview's breakdown entirely. Add them to a group to count them."
              />
              <div className="flex flex-wrap gap-2">
                {ungrouped.map((s) => (
                  <Badge key={s.id} tone="warning">
                    {s.name}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add Group' : 'Edit Group'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving} disabled={!name.trim() || stageIds.length === 0}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Group name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Disqualified"
          />
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Stages in this group</p>
            <div className="space-y-1.5">
              {stages.map((s) => {
                const taken = takenByOther(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 text-sm ${taken ? 'cursor-not-allowed text-ink-faint' : 'text-ink-muted'}`}
                  >
                    <input
                      type="checkbox"
                      checked={stageIds.includes(s.id)}
                      disabled={!!taken}
                      onChange={() => toggleStage(s.id)}
                      className="h-4 w-4 rounded border-line-strong text-brand-600 focus-ring disabled:opacity-40"
                    />
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                    {taken && <span className="text-xs">— already in "{taken}"</span>}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              One stage belongs to one group. A group of a single stage is fine.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete group"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={saving}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Delete <span className="font-medium text-ink">{confirmDelete?.name}</span>? Its stages go back to being
          ungrouped — nothing about the stages themselves changes.
        </p>
      </Modal>
    </div>
  );
}
