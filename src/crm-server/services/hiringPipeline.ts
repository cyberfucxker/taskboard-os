import { prisma } from '../prisma';

/**
 * The "Hiring" CRM pipeline that Meta job-application forms land in, so applicants never enter
 * the sales pipeline or the sales round-robin. Created on first use.
 */
export async function getOrCreateHiringPipeline(): Promise<{ pipelineId: string; pipelineStageId: string }> {
  let pipeline = await prisma.crmPipeline.findFirst({ where: { name: 'Hiring' } });
  if (!pipeline) {
    pipeline = await prisma.crmPipeline.create({
      data: {
        name: 'Hiring',
        description: 'Job applicants from Meta hiring forms. Not part of sales.',
        stages: {
          create: [
            { name: 'Applied', color: '#3E8B93', sortOrder: 0, winProbability: 10 },
            { name: 'Screening', color: '#56A7B0', sortOrder: 1, winProbability: 30 },
            { name: 'Interview', color: '#A78BFA', sortOrder: 2, winProbability: 50 },
            { name: 'Offer', color: '#F0883E', sortOrder: 3, winProbability: 80 },
            { name: 'Hired', color: '#6DBB7C', sortOrder: 4, winProbability: 100, isWon: true },
            { name: 'Rejected', color: '#F85149', sortOrder: 5, winProbability: 0, isLost: true },
          ],
        },
      },
    });
  }
  const firstStage = await prisma.crmPipelineStage.findFirst({
    where: { pipelineId: pipeline.id },
    orderBy: { sortOrder: 'asc' },
  });
  return { pipelineId: pipeline.id, pipelineStageId: firstStage!.id };
}
