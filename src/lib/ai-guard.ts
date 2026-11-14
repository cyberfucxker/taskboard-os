/**
 * Audited AI execution.
 *
 * Every AI call in TaskBoard goes through here so that a run is always recorded —
 * who triggered it, from which entry point, on what inputs, which model, how
 * many tokens, how long it took, and what happened. Without this, AI activity
 * was unreviewable: a model could be called, produce output, and leave no trace.
 *
 * The AgentRun row is inserted BEFORE the model call with status "running", so
 * a crash, timeout, or process kill still leaves evidence that the call started.
 *
 * This wrapper never throws for an AI failure. It returns a discriminated result
 * so callers can degrade gracefully instead of returning a 500.
 */

import { prisma } from "@/lib/db";
import {
  AIError,
  type AIOptions,
  type AIResult,
  type AIMessage,
  aiChatDetailed,
} from "@/lib/ai";

// Re-exported so callers can type their own per-call overrides without
// importing the transport layer directly.
export type { AIOptions };

// ─────────────────────────────────────────────────────────────────────────────
// Input redaction — AgentRun.inputs is retained data, so it must not become a
// secret store or a raw copy of employee/client PII beyond what is needed.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_KEY_RE =
  /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential|refresh|access[_-]?token|client[_-]?secret|private[_-]?key)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 4000 ? value.slice(0, 4000) + "…[truncated]" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Durable budget accounting
// ─────────────────────────────────────────────────────────────────────────────

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DurableBudget {
  tokenBudget: number;
  costBudgetUsd: number;
  used: boolean;
  reason?: string;
  tokensToday: number;
  costTodayUsd: number;
}

/**
 * Reads today's durable usage and compares it to the configured budgets.
 * Falls open (returns "not used") if the table is unavailable, so a missing
 * metrics table can never take down the product.
 */
export async function checkDurableBudget(): Promise<DurableBudget> {
  const tokenBudget = Number(process.env.AI_DAILY_TOKEN_BUDGET || "0") || 0;
  const costBudgetUsd = Number(process.env.AI_DAILY_COST_BUDGET_USD || "0") || 0;
  const empty: DurableBudget = {
    tokenBudget,
    costBudgetUsd,
    used: false,
    tokensToday: 0,
    costTodayUsd: 0,
  };
  if (tokenBudget <= 0 && costBudgetUsd <= 0) return empty;

  try {
    const row = await (prisma as any).aiUsageDaily.findUnique({ where: { day: utcDay() } });
    if (!row) return empty;
    const cost = Number(row.costUsd ?? 0);
    if (tokenBudget > 0 && row.totalTokens >= tokenBudget) {
      await (prisma as any).aiUsageDaily
        .update({ where: { day: utcDay() }, data: { budgetBlocked: { increment: 1 } } })
        .catch(() => undefined);
      return {
        ...empty,
        used: true,
        reason: `Daily token budget exhausted (${row.totalTokens.toLocaleString()}/${tokenBudget.toLocaleString()}).`,
        tokensToday: row.totalTokens,
        costTodayUsd: cost,
      };
    }
    if (costBudgetUsd > 0 && cost >= costBudgetUsd) {
      await (prisma as any).aiUsageDaily
        .update({ where: { day: utcDay() }, data: { budgetBlocked: { increment: 1 } } })
        .catch(() => undefined);
      return {
        ...empty,
        used: true,
        reason: `Daily cost budget exhausted ($${cost.toFixed(2)}/$${costBudgetUsd.toFixed(2)}).`,
        tokensToday: row.totalTokens,
        costTodayUsd: cost,
      };
    }
    return { ...empty, tokensToday: row.totalTokens, costTodayUsd: cost };
  } catch {
    return empty;
  }
}

/** Atomically folds one call's usage into today's durable totals. */
export async function recordDurableUsage(
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number },
  failed = false
): Promise<void> {
  const day = utcDay();
  try {
    await (prisma as any).aiUsageDaily.upsert({
      where: { day },
      create: {
        day,
        calls: 1,
        failures: failed ? 1 : 0,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        costUsd: usage.costUsd,
      },
      update: {
        calls: { increment: 1 },
        failures: failed ? { increment: 1 } : { increment: 0 },
        promptTokens: { increment: usage.promptTokens },
        completionTokens: { increment: usage.completionTokens },
        totalTokens: { increment: usage.totalTokens },
        costUsd: { increment: usage.costUsd },
      },
    });
  } catch (err) {
    // Never fail a user request because usage accounting failed.
    console.error("[ai-guard] failed to record durable usage:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audited run
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditedRunRequest {
  /** Agent key, e.g. "qa" | "anomaly" | "lead-enrich" | "task-standin". */
  agent: string;
  /** What this specific invocation did, e.g. "enrich_pipeline_leads". */
  action: string;
  /** Entry point for attribution, e.g. "api/ai/run". */
  source: string;
  /** Employee who triggered the run. null for system/cron invocations. */
  /**
   * Employee who triggered the run, when there is a session in scope.
   * Optional on purpose: library functions (e.g. the sales engine) can call the
   * model with no session, and forcing a fake value would put a false
   * attribution on the audit record. Those runs store null and identify
   * themselves through `inputs` instead.
   */
  principalId?: string | null;
  /** Structured record of what was fed in. Redacted before storage. */
  inputs: unknown;
  messages: AIMessage[];
  aiOptions?: AIOptions;
  confidence?: number;
  /** Persist this as the run's output once the call succeeds. */
  output?: unknown;
  /** Flag the run as needing a human decision before acting on it. */
  requiresApproval?: boolean;
  /** Runs after a successful call; return value is stored as the output. */
  afterSuccess?: (text: string, result: AIResult) => Promise<unknown> | unknown;
}

export type AuditedRunResult =
  | { ok: true; text: string; runId: string; result: AIResult }
  | { ok: false; runId: string | null; kind: string; message: string };

export async function runAuditedAI(req: AuditedRunRequest): Promise<AuditedRunResult> {
  let runId: string | null = null;

  // ── Durable budget gate ───────────────────────────────────────────────────
  const budget = await checkDurableBudget();
  if (budget.used) {
    return { ok: false, runId: null, kind: "budget_exhausted", message: budget.reason! };
  }

  // ── Record the intent BEFORE calling the model ────────────────────────────
  try {
    const created = await (prisma as any).agentRun.create({
      data: {
        agent: req.agent,
        action: req.action,
        inputs: redact(req.inputs) as any,
        status: "running",
        principalId: req.principalId ?? null,
        source: req.source,
        requiresApproval: req.requiresApproval ?? false,
      },
      select: { id: true },
    });
    runId = created.id;
  } catch (err) {
    // If the audit trail itself is broken we must NOT silently proceed — that
    // is exactly the unauditable behaviour this module exists to prevent.
    console.error("[ai-guard] could not open AgentRun:", err);
    return {
      ok: false,
      runId: null,
      kind: "audit_unavailable",
      message: "AI audit trail is unavailable, so the request was refused.",
    };
  }

  const finish = (data: Record<string, unknown>) =>
    (prisma as any)
      .agentRun.update({ where: { id: runId }, data })
      .catch((err: unknown) => console.error("[ai-guard] could not close AgentRun:", err));

  // From here on the row definitely exists: every path that leaves runId null
  // has already returned. Narrowed explicitly so the success branch can promise
  // a real run id to callers that use it to trace cost and output.
  if (runId === null) {
    return {
      ok: false,
      runId: null,
      kind: "audit_unavailable",
      message: "AI audit trail is unavailable, so the request was refused.",
    };
  }
  const auditId: string = runId;

  // ── Call the model ────────────────────────────────────────────────────────
  try {
    const result = await aiChatDetailed(req.messages, {
      purpose: req.action,
      ...(req.aiOptions ?? {}),
    });

    await recordDurableUsage(result.usage, false);

    let output: unknown = req.output;
    if (req.afterSuccess) {
      try {
        output = await req.afterSuccess(result.text, result);
      } catch (err) {
        console.error("[ai-guard] afterSuccess hook failed:", err);
      }
    }

    await finish({
      status: req.requiresApproval ? "needs_approval" : "succeeded",
      model: result.model,
      output: (output === undefined ? { text: result.text } : redact(output)) as any,
      confidence: req.confidence ?? null,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      costUsd: result.usage.costUsd,
      finishedAt: new Date(),
    });

    return { ok: true, text: result.text, runId: auditId, result };
  } catch (err) {
    const e = err instanceof AIError ? err : null;
    const kind = e?.kind ?? "unexpected";
    const message = e?.message ?? String(err);

    await recordDurableUsage(
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
      true
    );
    await finish({
      status: "failed",
      error: message.slice(0, 2000),
      errorKind: kind,
      attempts: e?.attempts ?? 0,
      finishedAt: new Date(),
    });

    console.error(
      `[ai-guard] run ${auditId} failed (${req.agent}/${req.action}, kind=${kind}): ${message}`
    );
    return { ok: false, runId: auditId, kind, message };
  }
}

/** Human-facing message for each failure kind. */
export function aiFailureMessage(kind: string, raw: string): string {
  switch (kind) {
    case "not_configured":
      return "AI is not configured on this server. Ask an admin to set AI_GATEWAY_API_KEY.";
    case "timeout":
      return "The AI provider did not respond in time. Please try again.";
    case "rate_limited":
      return "The AI service is busy right now. Please try again in a minute.";
    case "circuit_open":
      return "The AI service is temporarily unavailable after repeated failures. Try again shortly.";
    case "budget_exhausted":
      return raw || "The AI usage budget for today has been used up. Try again tomorrow.";
    case "concurrency":
      return "Too many AI requests at once. Please try again in a moment.";
    case "invalid_response":
      return "The AI returned a response this app could not use. Nothing was changed.";
    case "audit_unavailable":
      return raw || "AI is temporarily unavailable.";
    default:
      return "The AI request failed. Nothing was changed.";
  }
}
