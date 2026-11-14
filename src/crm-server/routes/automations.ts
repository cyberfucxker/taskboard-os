import { Router } from '../express';
import { prisma } from '../prisma';
import { runAutomationManually } from '../services/automationEngine';

export const automationsRouter = Router();

const VALID_STEP_TYPES = ['condition', 'action', 'delay'];

function validateSteps(steps: unknown): string | null {
  if (!Array.isArray(steps)) return 'steps must be an array.';
  for (const step of steps as any[]) {
    if (!VALID_STEP_TYPES.includes(step?.type)) return `Invalid step type "${step?.type}".`;
    if (!step.config || typeof step.config !== 'object') return 'Every step needs a config object.';
  }
  return null;
}

automationsRouter.get('/', async (_req, res) => {
  const rows = await prisma.crmAutomation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { steps: { orderBy: { sortOrder: 'asc' } }, _count: { select: { runs: true } } },
  });
  res.json(rows.map(({ _count, ...a }) => ({ ...a, runCount: _count.runs })));
});

automationsRouter.get('/manual', async (_req, res) => {
  const rows = await prisma.crmAutomation.findMany({ where: { enabled: true, triggerType: 'manual' }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

automationsRouter.get('/:id', async (req, res) => {
  const row = await prisma.crmAutomation.findUnique({ where: { id: req.params.id }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
  if (!row) return res.status(404).json({ error: 'Automation not found' });
  res.json(row);
});

automationsRouter.post('/', async (req, res) => {
  const { name, description, enabled, respectBusinessHours, triggerType, triggerConfig, steps } = req.body as {
    name: string;
    description?: string;
    enabled?: boolean;
    respectBusinessHours?: boolean;
    triggerType: string;
    triggerConfig?: unknown;
    steps?: unknown;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!triggerType) return res.status(400).json({ error: 'Trigger event is required.' });

  const stepError = validateSteps(steps ?? []);
  if (stepError) return res.status(400).json({ error: stepError });

  const created = await prisma.crmAutomation.create({
    data: {
      name: name.trim(),
      description: description?.trim() || undefined,
      enabled: enabled ?? true,
      respectBusinessHours: !!respectBusinessHours,
      triggerType,
      triggerConfig: (triggerConfig ?? undefined) as any,
      steps: {
        create: (steps as any[] ?? []).map((s, index) => ({ type: s.type, sortOrder: index, config: s.config })),
      },
    },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  res.status(201).json(created);
});

automationsRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.crmAutomation.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Automation not found' });

  const { name, description, enabled, respectBusinessHours, triggerType, triggerConfig, steps } = req.body as {
    name?: string;
    description?: string;
    enabled?: boolean;
    respectBusinessHours?: boolean;
    triggerType?: string;
    triggerConfig?: unknown;
    steps?: unknown;
  };

  if (steps !== undefined) {
    const stepError = validateSteps(steps);
    if (stepError) return res.status(400).json({ error: stepError });
  }

  // Steps are replaced wholesale, same as the Forms builder's fields: the editor always submits
  // the full, ordered list, and a step carries no history worth preserving individually — the
  // AutomationRun log already records what actually happened at the time a run passed through it.
  const updated = await prisma.$transaction(async (tx) => {
    if (steps !== undefined) {
      await tx.crmAutomationStep.deleteMany({ where: { automationId: existing.id } });
    }
    return tx.crmAutomation.update({
      where: { id: existing.id },
      data: {
        name: name?.trim(),
        description: description !== undefined ? description?.trim() || null : undefined,
        enabled,
        respectBusinessHours,
        triggerType,
        triggerConfig: triggerConfig !== undefined ? (triggerConfig as any) : undefined,
        ...(steps !== undefined
          ? { steps: { create: (steps as any[]).map((s, index) => ({ type: s.type, sortOrder: index, config: s.config })) } }
          : {}),
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  });
  res.json(updated);
});

automationsRouter.post('/:id/toggle', async (req, res) => {
  const existing = await prisma.crmAutomation.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Automation not found' });
  const updated = await prisma.crmAutomation.update({ where: { id: req.params.id }, data: { enabled: !existing.enabled } });
  res.json(updated);
});

automationsRouter.delete('/:id', async (req, res) => {
  await prisma.crmAutomation.delete({ where: { id: req.params.id } }).catch(() => undefined);
  res.status(204).send();
});

automationsRouter.get('/runs/list', async (req, res) => {
  const { page = '1', pageSize = '20', automationId } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 20);

  const where = automationId && automationId !== 'all' ? { automationId } : {};
  const [items, total] = await Promise.all([
    prisma.crmAutomationRun.findMany({ where, orderBy: { ranAt: 'desc' }, skip: (pageNum - 1) * size, take: size }),
    prisma.crmAutomationRun.count({ where }),
  ]);

  // AutomationRun.leadId is a plain string (not a Prisma relation) — resolve names with one
  // extra lookup. That lookup is narrowed to the caller's data scope, so a lead outside it
  // shows no name.
  const leads = await prisma.crmLead.findMany({
    where: { id: { in: items.map((r) => r.leadId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(leads.map((l) => [l.id, `${l.firstName} ${l.lastName}`.trim()]));

  res.json({
    items: items.map((r) => ({ ...r, leadName: nameById.get(r.leadId) })),
    total,
    page: pageNum,
    pageSize: size,
  });
});

/**
 * Runs the automation's full step chain (conditions, actions, delays) for each selected lead —
 * the same engine every automatic trigger uses (server/src/services/automationEngine.ts).
 * `teamMemberIds` is only meaningful for an `assign_lead` step with `assignMode: 'team'` saved
 * without a `teamId` (legacy-era steps). TaskBoard stores Teams, so a step naming a team resolves
 * its members server-side and this is a fallback.
 *
 * The lead ids come from the browser, so they are narrowed to the caller's data scope first —
 * the engine then runs as the system, and would otherwise act on any id it was handed.
 */
automationsRouter.post('/:id/run', async (req, res) => {
  const { leadIds, teamMemberIds } = req.body as { leadIds: string[]; teamMemberIds?: string[] };
  const automation = await prisma.crmAutomation.findUnique({ where: { id: req.params.id } });
  if (!automation) return res.status(404).json({ error: 'Automation not found' });

  const requested = Array.isArray(leadIds) ? leadIds.map(String) : [];
  const visible = await prisma.crmLead.findMany({ where: { id: { in: requested } }, select: { id: true } });
  const allowed = new Set(visible.map((l) => l.id));
  const refused = requested.filter((id) => !allowed.has(id)).length;

  const result = await runAutomationManually(automation.id, [...allowed], teamMemberIds);
  res.json({ ...result, skipped: result.skipped + refused });
});
