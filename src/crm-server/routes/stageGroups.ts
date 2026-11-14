import { Router } from '../express';
import { prisma } from '../prisma';
import type { AuthedRequest } from '../services/auth';

/**
 * CRM > Stage Groups — how the Overview's breakdown reads a pipeline's stages.
 *
 * "NATC + Other + Disqualified, shown as Disqualified." Ten stages become seven lines without
 * anything being renamed, merged or deleted: the Leads list, the Kanban board and the pipeline
 * itself keep working on the real stages, and switching this off would change nothing but the
 * one chart.
 */
export const stageGroupsRouter = Router();

/** Trimmed, de-duplicated, order preserved. */
function cleanIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const value of input) {
    const id = String(value ?? '').trim();
    if (id) seen.add(id);
  }
  return [...seen];
}

function serialize(g: {
  id: string; name: string; sortOrder: number; pipelineId: string;
  stages: { stage: { id: string; name: string; color: string; sortOrder: number } }[];
}) {
  return {
    id: g.id,
    pipelineId: g.pipelineId,
    name: g.name,
    sortOrder: g.sortOrder,
    // In pipeline order inside the group, so "NATC, Other, Disqualified" reads the way the
    // board does rather than in whatever order the boxes were ticked.
    stages: g.stages
      .map((s) => s.stage)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.id, name: s.name, color: s.color })),
  };
}

const groupInclude = {
  stages: { include: { stage: { select: { id: true, name: true, color: true, sortOrder: true } } } },
} as const;

/**
 * The groups for one pipeline, plus every stage in it and which group each one is in.
 *
 * Both in one response because the settings screen cannot render a checkbox list without
 * knowing what is already taken — a stage may only be in one group, and the form has to grey
 * out the rest rather than accept the tick and fail on save.
 */
stageGroupsRouter.get('/', async (req, res, next) => {
  try {
    const pipelineId = String(req.query.pipelineId ?? '').trim();
    if (!pipelineId) return res.json({ groups: [], stages: [] });

    const [groups, stages] = await Promise.all([
      prisma.crmStageGroup.findMany({
        where: { pipelineId },
        include: groupInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.crmPipelineStage.findMany({
        where: { pipelineId },
        orderBy: { sortOrder: 'asc' },
        include: { stageGroup: { select: { groupId: true } } },
      }),
    ]);

    res.json({
      groups: groups.map(serialize),
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        /// Which group already has it, so the form can say so rather than just refusing.
        groupId: s.stageGroup?.groupId ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** The stages of `ids` that belong to `pipelineId`, or the first one that does not. */
async function validateStages(pipelineId: string, ids: string[]) {
  const stages = await prisma.crmPipelineStage.findMany({
    where: { id: { in: ids } },
    select: { id: true, pipelineId: true },
  });
  if (stages.length !== ids.length) return { error: 'One of those stages no longer exists.' };
  const foreign = stages.find((s) => s.pipelineId !== pipelineId);
  if (foreign) return { error: 'A group can only hold stages from its own pipeline.' };
  return { ok: true as const };
}

/** Which of `ids` are already spoken for, ignoring the group being edited. */
async function alreadyGrouped(ids: string[], ignoreGroupId?: string) {
  const taken = await prisma.crmStageGroupStage.findMany({
    where: { stageId: { in: ids }, ...(ignoreGroupId ? { groupId: { not: ignoreGroupId } } : {}) },
    include: { stage: { select: { name: true } }, group: { select: { name: true } } },
  });
  return taken;
}

stageGroupsRouter.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pipelineId = String(req.body?.pipelineId ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const stageIds = cleanIds(req.body?.stageIds);

    if (!pipelineId) return res.status(400).json({ error: 'Pick a pipeline.' });
    if (!name) return res.status(400).json({ error: 'A group needs a name.' });
    // A group of one is fine and was asked for — Prospect and Won are each a single stage.
    if (stageIds.length === 0) return res.status(400).json({ error: 'Pick at least one stage.' });

    const valid = await validateStages(pipelineId, stageIds);
    if ('error' in valid) return res.status(400).json({ error: valid.error });

    const taken = await alreadyGrouped(stageIds);
    if (taken.length > 0) {
      return res.status(409).json({
        error: `"${taken[0].stage.name}" is already in the group "${taken[0].group.name}".`,
      });
    }

    // Created last, so it lands at the bottom: the order is the order they were made in.
    const last = await prisma.crmStageGroup.findFirst({ where: { pipelineId }, orderBy: { sortOrder: 'desc' } });

    const created = await prisma.crmStageGroup.create({
      data: {
        pipelineId,
        name,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        stages: { create: stageIds.map((stageId) => ({ stageId })) },
      },
      include: groupInclude,
    });
    res.status(201).json(serialize(created));
  } catch (err) {
    next(err);
  }
});

stageGroupsRouter.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crmStageGroup.findUnique({ where: { id }, select: { id: true, pipelineId: true } });
    if (!existing) return res.status(404).json({ error: 'Stage group not found' });

    const data: { name?: string } = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'A group needs a name.' });
      data.name = name;
    }

    let stageIds: string[] | null = null;
    if (req.body?.stageIds !== undefined) {
      stageIds = cleanIds(req.body.stageIds);
      if (stageIds.length === 0) return res.status(400).json({ error: 'Pick at least one stage.' });

      const valid = await validateStages(existing.pipelineId, stageIds);
      if ('error' in valid) return res.status(400).json({ error: valid.error });

      const taken = await alreadyGrouped(stageIds, id);
      if (taken.length > 0) {
        return res.status(409).json({
          error: `"${taken[0].stage.name}" is already in the group "${taken[0].group.name}".`,
        });
      }
    }

    // Membership is replaced rather than diffed: the form always sends the full set, and a
    // delete-then-create inside one transaction cannot leave a stage in two groups halfway.
    const updated = await prisma.$transaction(async (tx) => {
      if (stageIds) {
        await tx.crmStageGroupStage.deleteMany({ where: { groupId: id } });
        await tx.crmStageGroupStage.createMany({ data: stageIds.map((stageId) => ({ groupId: id, stageId })) });
      }
      if (Object.keys(data).length) await tx.crmStageGroup.update({ where: { id }, data });
      return tx.crmStageGroup.findUniqueOrThrow({ where: { id }, include: groupInclude });
    });

    res.json(serialize(updated));
  } catch (err) {
    next(err);
  }
});

stageGroupsRouter.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    // The memberships go with it (cascade); the stages themselves are untouched.
    await prisma.crmStageGroup.delete({ where: { id: String(req.params.id) } });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
