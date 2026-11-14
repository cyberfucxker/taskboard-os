import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { scopedTaskWhere } from "@/lib/scope";
import { aiFailureMessage, runAuditedAI } from "@/lib/ai-guard";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  taskId: z.string().min(1),
  /** Optional free-form extra direction for the agent. */
  guidance: z.string().max(4000).nullish(),
});

/**
 * Builds the agent's standing brief for an assignee.
 *
 * Previously this route hard-required `assignee.agentConfig.isActive`. Because
 * no employee in the system had an AgentConfig row, the endpoint returned 400
 * for every possible input and the feature was unreachable. It now falls back
 * to a brief derived from the person's actual role, title and department, so
 * the feature works out of the box while an explicit configuration still wins.
 */
function buildBrief(assignee: {
  name: string;
  role: string;
  title: string | null;
  department: { name: string } | null;
  agentConfig: {
    roleBrief: string;
    skills: unknown;
    isActive: boolean;
    model: string;
  } | null;
}): { roleBrief: string; skills: { name: string; instructions?: string; description?: string }[]; model: string | undefined; source: "configured" | "derived" } {
  const cfg = assignee.agentConfig;
  const skills = Array.isArray(cfg?.skills)
    ? (cfg!.skills as { name: string; instructions?: string; description?: string }[])
    : [];

  if (cfg?.isActive && (cfg.roleBrief?.trim() || skills.length > 0)) {
    return {
      roleBrief: cfg.roleBrief || "",
      skills,
      model: cfg.model || undefined,
      source: "configured",
    };
  }

  const where = [
    assignee.title ? `their title (${assignee.title})` : null,
    assignee.department?.name ? `their department (${assignee.department.name})` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  return {
    roleBrief:
      `They are a ${assignee.role} at Acme Inc` +
      (where ? `, working in ${where}` : "") +
      `. No personal AI brief has been configured for them, so infer the kind of work ` +
      `someone in that position would be asked to produce and write the concrete deliverable ` +
      `itself rather than describing what they would do.`,
    skills: [],
    model: cfg?.model || undefined,
    source: "derived",
  };
}

/**
 * POST /api/agent/run-task
 *
 * Runs the assignee's configured (or role-derived) AI agent against a task and
 * posts the result as a task comment.
 *
 * FIXES applied in this rewrite:
 *  - Authorization. The route previously required only `tasks.view` — a
 *    permission every role in the system holds — while performing a WRITE
 *    (creating a task comment). Any authenticated user, including INTERN, could
 *    inject AI-authored content onto any visible task. It now requires
 *    `tasks.manage` and additionally verifies the task is inside the caller's
 *    data scope, so the capability check and the scope check agree.
 *  - Reachability. See `buildBrief` above.
 *  - Attribution. AI output is no longer an anonymous comment: it records the
 *    AgentRun id, states plainly that it is an unreviewed AI draft, and the run
 *    itself is persisted with the invoking principal.
 *  - Failure handling. A model/provider failure now returns a classified status
 *    code and never a bare 500.
 */
export async function POST(req: Request) {
  let session: Awaited<ReturnType<typeof requireRole>>;
  try {
    session = await requireRole("tasks.manage");
  } catch {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to run an agent on a task." },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `Invalid request: ${parsed.error.message}` },
      { status: 400 }
    );
  }
  const { taskId, guidance } = parsed.data;

  // Scope check: the task must be visible to this caller, not merely exist.
  const visible = await scopedTaskWhere(session as any);
  const task = await prisma.task.findFirst({
    where: { AND: [{ id: taskId, deletedAt: null }, visible] },
    include: {
      assignee: { include: { agentConfig: true, department: { select: { name: true } } } },
      project: { select: { name: true } },
    },
  });

  if (!task) {
    return NextResponse.json(
      { ok: false, error: "Task not found, or it is outside your access scope." },
      { status: 404 }
    );
  }
  if (!task.assignee) {
    return NextResponse.json(
      { ok: false, error: "This task has no assignee, so there is no role for an agent to stand in for." },
      { status: 400 }
    );
  }
  if (task.status === "DONE") {
    return NextResponse.json(
      { ok: false, error: "This task is already DONE — nothing for an agent to produce." },
      { status: 400 }
    );
  }

  const brief = buildBrief(task.assignee as any);

  const systemPrompt = [
    `You are the AI stand-in for ${task.assignee.name}${task.assignee.title ? ` (${task.assignee.title})` : ""} at Acme Inc.`,
    brief.roleBrief,
    brief.skills.length
      ? `Their configured skills:\n${brief.skills
          .map((s) => `- ${s.name}: ${s.instructions || s.description || ""}`)
          .join("\n")}`
      : "",
    "Produce the concrete output this task needs — a draft, a summary, next steps, or a status update.",
    "Write the deliverable itself. Do not describe what you would do, and do not add preamble or meta-commentary.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userPrompt = [
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : "",
    task.project?.name ? `Project: ${task.project.name}` : "",
    `Priority: ${task.priority}`,
    task.dueDate ? `Due: ${new Date(task.dueDate).toISOString().slice(0, 10)}` : "",
    guidance ? `Extra direction from ${session.user.name || session.user.email}:\n${guidance}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const run = await runAuditedAI({
    agent: "task-standin",
    action: `run_task_${task.code || task.id}`,
    source: "agent/run-task",
    principalId: session.user.id,
    inputs: {
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      project: task.project?.name ?? null,
      standInFor: task.assignee.name,
      briefSource: brief.source,
      guidance: guidance ?? null,
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    aiOptions: { model: brief.model, max_tokens: 900 },
    // The comment is a draft for a human to review — it is not approved work.
    requiresApproval: true,
  });

  if (!run.ok) {
    const status = run.kind === "budget_exhausted" || run.kind === "rate_limited" ? 429 : 503;
    return NextResponse.json(
      { ok: false, error: aiFailureMessage(run.kind, run.message), kind: run.kind, runId: run.runId },
      { status }
    );
  }

  const disclaimer =
    brief.source === "derived"
      ? `_No personal AI brief is configured for ${task.assignee.name}, so this used their role and department._`
      : `_Using ${task.assignee.name}'s configured AI brief._`;

  const comment = await prisma.taskComment.create({
    data: {
      taskId: task.id,
      // Deliberately not attributed to a human: this is machine output.
      authorId: null,
      body:
        `🤖 **AI draft — standing in for ${task.assignee.name}** — *unreviewed*\n\n` +
        `${run.text}\n\n---\n${disclaimer}\n` +
        `_Agent run \`${run.runId}\` · ${run.result.usage.totalTokens} tokens · ` +
        `${run.result.latencyMs}ms · model \`${run.result.model}\`._`,
    },
  });

  return NextResponse.json({
    ok: true,
    comment,
    run: {
      id: run.runId,
      agent: "task-standin",
      status: "needs_approval",
      model: run.result.model,
      promptTokens: run.result.usage.promptTokens,
      completionTokens: run.result.usage.completionTokens,
      costUsd: run.result.usage.costUsd,
      latencyMs: run.result.latencyMs,
      attempts: run.result.attempts,
      briefSource: brief.source,
    },
    triggeredBy: session.user.id,
  });
}
