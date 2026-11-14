import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { AiHub, type AgentRunView } from "@/components/ai/AiHub";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  await guardPage("AI");
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      agent: true,
      action: true,
      inputs: true,
      output: true,
      confidence: true,
      model: true,
      status: true,
      spentPaise: true,
      createdAt: true,
    },
  });

  const formattedRuns: AgentRunView[] = runs.map((r) => ({
    id: r.id,
    agent: r.agent,
    action: r.action,
    inputs: r.inputs,
    output: r.output,
    confidence: r.confidence,
    model: r.model,
    status: r.status,
    spentPaise: r.spentPaise ? Number(r.spentPaise) : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return <AiHub initialRuns={formattedRuns} />;
}
