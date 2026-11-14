import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, GitBranch, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { Pipeline, PipelineStage } from '../../types';

/**
 * Inline popover for changing a lead's pipeline stage — same feel as the task
 * StatusPicker: click the stage badge, get a searchable floating list, pick, done.
 *
 * Props:
 *   leadId        — used to fire the update callback
 *   pipelineId    — the lead's current pipeline (undefined = unassigned)
 *   stageId       — the lead's current stage (undefined = unassigned)
 *   pipelines     — all pipelines (from usePipelineReferenceData)
 *   stagesForPipeline — helper from usePipelineReferenceData
 *   onChange      — async (pipelineId, stageId) => void — called after user picks
 *   children      — the trigger element
 *   disabled      — render trigger only, no popover
 */
export function StagePicker({
  pipelineId,
  stageId,
  pipelines,
  stagesForPipeline,
  onChange,
  children,
  disabled,
}: {
  pipelineId?: string;
  stageId?: string;
  pipelines: Pipeline[];
  stagesForPipeline: (pid: string) => PipelineStage[];
  onChange: (pipelineId: string, stageId: string) => Promise<void>;
  children: React.ReactElement;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (disabled) return children;

  const ql = q.trim().toLowerCase();
  // Build flat list: for each pipeline show its matching stages
  const groups = pipelines
    .map((p) => ({
      pipeline: p,
      stages: stagesForPipeline(p.id).filter(
        (s) => !ql || s.name.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql)
      ),
    }))
    .filter((g) => g.stages.length > 0);

  const pick = async (pid: string, sid: string) => {
    if (busy) return;
    setOpen(false);
    setQ('');
    if (pid === pipelineId && sid === stageId) return;
    setBusy(true);
    try {
      await onChange(pid, sid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-flex" ref={triggerRef}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (!busy) { setQ(''); setOpen((o) => !o); }
        }}
        className="cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {children}
      </div>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-line bg-surface-overlay shadow-lg"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,.15)' }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <GitBranch size={13} className="shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Change stage…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="text-ink-faint hover:text-ink">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Unassigned option */}
          {(!ql || 'unassigned'.includes(ql)) && (
            <button
              type="button"
              onClick={() => { setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-faint hover:bg-hover"
            >
              <span className="h-2 w-2 rounded-full border border-line-strong" />
              <span className="flex-1">Unassigned</span>
              {!stageId && <Check size={12} className="text-ink-muted" />}
            </button>
          )}

          {/* Groups */}
          <div className="max-h-64 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-center text-[13px] text-ink-faint">No stages found</p>
            ) : (
              groups.map(({ pipeline, stages }) => (
                <div key={pipeline.id}>
                  {pipelines.length > 1 && (
                    <p className="px-3 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      {pipeline.name}
                    </p>
                  )}
                  {stages.map((s) => {
                    const active = s.pipelineId === pipelineId && s.id === stageId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pick(s.pipelineId, s.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink hover:bg-hover',
                          active && 'font-medium'
                        )}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color ?? '#94a3b8' }}
                        />
                        <span className="flex-1 truncate">{s.name}</span>
                        {active && <Check size={12} className="shrink-0 text-ink-muted" />}
                        {s.isWon && <ChevronRight size={11} className="shrink-0 text-success-600" />}
                        {s.isLost && <ChevronRight size={11} className="shrink-0 text-danger-600" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
