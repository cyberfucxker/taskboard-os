/**
 * Unified AI client for TaskBoard OS.
 *
 * WHY THIS FILE WAS REWRITTEN
 *   The previous version was a single bare `fetch` to the AI gateway with:
 *     - no timeout      -> a hung provider hung the HTTP request forever
 *     - no retry        -> any transient 5xx became a user-visible failure
 *     - no rate limit   -> a handful of calls could exhaust the process
 *     - no cost ceiling -> spend was unbounded and unattributable
 *     - no circuit breaker -> a dead provider was retried on every call
 *     - `JSON.parse(raw)` with no guard -> the single most common LLM failure
 *       mode (prose or truncated output) surfaced as an unhandled 500.
 *
 * WHAT IT PROVIDES NOW
 *   Hard timeout, bounded retry with jitter (retryable errors only), a circuit
 *   breaker, a concurrency limit, a daily token/cost budget with a hard stop,
 *   typed errors, usage reporting on every call, and schema-validated JSON
 *   output with one repair attempt.
 *
 * Every function is still safe to call from a request handler: nothing here
 * throws a raw provider error at the caller without classifying it first.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const AI_GATEWAY_BASE = (process.env.AI_GATEWAY_BASE_URL || "http://localhost:4000/v1").replace(
  /\/+$/,
  ""
);
const AI_GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY || "";
const DEFAULT_MODEL = process.env.AI_GATEWAY_MODEL || "gpt-4o-mini";

const TIMEOUT_MS = num(process.env.AI_TIMEOUT_MS, 45_000);
const MAX_RETRIES = num(process.env.AI_MAX_RETRIES, 2);
const BASE_BACKOFF_MS = num(process.env.AI_RETRY_BASE_MS, 500);
const CIRCUIT_FAILURE_THRESHOLD = num(process.env.AI_CIRCUIT_FAILURES, 5);
const CIRCUIT_OPEN_MS = num(process.env.AI_CIRCUIT_OPEN_MS, 30_000);
const MAX_CONCURRENT = num(process.env.AI_MAX_CONCURRENT, 4);
const RATE_LIMIT_PER_MIN = num(process.env.AI_RATE_LIMIT_PER_MIN, 60);
const DAILY_TOKEN_BUDGET = num(process.env.AI_DAILY_TOKEN_BUDGET, 2_000_000);
const DAILY_COST_BUDGET_USD = Number(process.env.AI_DAILY_COST_BUDGET_USD || "0") || 0;
const FALLBACK_MODEL = process.env.AI_GATEWAY_FALLBACK_MODEL || "";

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
  /** Label used in logs, circuit-breaker stats and the caller's audit trail. */
  purpose?: string;
  /** Overrides the per-minute request ceiling for a single call. */
  bypassRateLimit?: boolean;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface AIResult {
  text: string;
  model: string;
  usage: AIUsage;
  latencyMs: number;
  attempts: number;
}

export type AIErrorKind =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "circuit_open"
  | "budget_exhausted"
  | "concurrency"
  | "provider_error"
  | "invalid_response"
  | "aborted";

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly attempts: number;

  constructor(
    kind: AIErrorKind,
    message: string,
    opts: { retryable?: boolean; status?: number; attempts?: number } = {}
  ) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    this.attempts = opts.attempts ?? 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-process-ish state (circuit breaker, semaphore, budget, rate limit)
// Cached on globalThis in EVERY environment. The previous emitter code cached
// only in development, which silently created fresh instances in production.
// ─────────────────────────────────────────────────────────────────────────────

interface AIState {
  consecutiveFailures: number;
  circuitOpenedAt: number;
  inflight: number;
  requestTimestamps: number[];
  tokensToday: number;
  costTodayUsd: number;
  budgetDay: string;
  servedByInFlight: number;
  servedByCircuit: number;
  servedByBudget: number;
  servedByRateLimit: number;
}

const g = globalThis as unknown as { __taskboardAIState?: AIState };

function state(): AIState {
  if (!g.__taskboardAIState) {
    g.__taskboardAIState = {
      consecutiveFailures: 0,
      circuitOpenedAt: 0,
      inflight: 0,
      requestTimestamps: [],
      tokensToday: 0,
      costTodayUsd: 0,
      budgetDay: "",
      servedByInFlight: 0,
      servedByCircuit: 0,
      servedByBudget: 0,
      servedByRateLimit: 0,
    };
  }
  const s = g.__taskboardAIState;
  const today = new Date().toISOString().slice(0, 10);
  if (s.budgetDay !== today) {
    s.budgetDay = today;
    s.tokensToday = 0;
    s.costTodayUsd = 0;
  }
  return s;
}

function circuitIsOpen(): boolean {
  const s = state();
  if (s.circuitOpenedAt === 0) return false;
  if (Date.now() - s.circuitOpenedAt >= CIRCUIT_OPEN_MS) {
    // Half-open: let one request through to probe the provider.
    s.circuitOpenedAt = 0;
    s.consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordSuccess() {
  const s = state();
  s.consecutiveFailures = 0;
  s.circuitOpenedAt = 0;
}

function recordFailure() {
  const s = state();
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    s.circuitOpenedAt = Date.now();
  }
}

function checkRateLimit(bypass: boolean) {
  if (bypass || RATE_LIMIT_PER_MIN <= 0) return;
  const s = state();
  const cutoff = Date.now() - 60_000;
  s.requestTimestamps = s.requestTimestamps.filter((t) => t > cutoff);
  if (s.requestTimestamps.length >= RATE_LIMIT_PER_MIN) {
    s.servedByRateLimit += 1;
    throw new AIError(
      "rate_limited",
      `AI rate limit reached (${RATE_LIMIT_PER_MIN}/min). Try again shortly.`,
      { retryable: true }
    );
  }
  s.requestTimestamps.push(Date.now());
}

function checkBudget() {
  const s = state();
  if (s.tokensToday >= DAILY_TOKEN_BUDGET) {
    s.servedByBudget += 1;
    throw new AIError(
      "budget_exhausted",
      `Daily AI token budget exhausted (${s.tokensToday.toLocaleString()}/${DAILY_TOKEN_BUDGET.toLocaleString()}). Resets at 00:00 UTC.`,
      { retryable: false }
    );
  }
  if (DAILY_COST_BUDGET_USD > 0 && s.costTodayUsd >= DAILY_COST_BUDGET_USD) {
    s.servedByBudget += 1;
    throw new AIError(
      "budget_exhausted",
      `Daily AI cost budget exhausted ($${s.costTodayUsd.toFixed(2)}/$${DAILY_COST_BUDGET_USD.toFixed(2)}).`,
      { retryable: false }
    );
  }
}

async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  const s = state();
  if (s.inflight >= MAX_CONCURRENT) {
    s.servedByInFlight += 1;
    throw new AIError(
      "concurrency",
      `Too many concurrent AI requests (limit ${MAX_CONCURRENT}). Try again in a moment.`,
      { retryable: true }
    );
  }
  s.inflight += 1;
  try {
    return await fn();
  } finally {
    s.inflight -= 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost model
// USD per 1M tokens. Override with AI_PRICE_<MODEL_KEY> if the AI gateway pricing
// differs. Token counts are always recorded regardless of pricing accuracy.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRICE = { input: 2.0, output: 8.0 };

function priceFor(model: string): { input: number; output: number } {
  const key = model.replace(/[^A-Za-z0-9]/g, "_");
  const override = process.env[`AI_PRICE_${key.toUpperCase()}`];
  if (override) {
    const [i, o] = override.split(",").map(Number);
    if (Number.isFinite(i) && Number.isFinite(o)) return { input: i, output: o };
  }
  return DEFAULT_PRICE;
}

function costOf(model: string, prompt: number, completion: number): number {
  const p = priceFor(model);
  return (prompt / 1_000_000) * p.input + (completion / 1_000_000) * p.output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider call
// ─────────────────────────────────────────────────────────────────────────────

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function classify(res: Response): AIError {
  if (res.status === 429) {
    return new AIError("rate_limited", `AI provider rate limited (429).`, {
      retryable: true,
      status: 429,
    });
  }
  if (res.status === 408 || res.status === 504) {
    return new AIError("timeout", `AI provider timed out (${res.status}).`, {
      retryable: true,
      status: res.status,
    });
  }
  if (res.status >= 500) {
    return new AIError("provider_error", `AI provider error (${res.status}).`, {
      retryable: true,
      status: res.status,
    });
  }
  return new AIError("provider_error", `AI provider rejected the request (${res.status}).`, {
    retryable: false,
    status: res.status,
  });
}

interface RawCompletion {
  content: string;
  usage: AIUsage;
  model: string;
}

async function callProvider(
  model: string,
  messages: AIMessage[],
  opts: AIOptions,
  attempt: number
): Promise<RawCompletion> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.max_tokens ?? 2048,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${AI_GATEWAY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_GATEWAY_KEY}`,
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError" || e.name === "TimeoutError") {
      throw new AIError(
        "timeout",
        `AI request exceeded ${TIMEOUT_MS}ms and was aborted.`,
        { retryable: true, attempts: attempt }
      );
    }
    throw new AIError(
      "provider_error",
      `Could not reach the AI provider at ${AI_GATEWAY_BASE}: ${e.message}`,
      { retryable: true, attempts: attempt }
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* body already consumed or unreadable */
    }
    const err = classify(res);
    throw new AIError(err.kind, `${err.message}${detail ? ` — ${detail}` : ""}`, {
      retryable: err.retryable,
      status: res.status,
      attempts: attempt,
    });
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new AIError("invalid_response", "AI provider returned a non-JSON body.", {
      retryable: true,
      attempts: attempt,
    });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new AIError("invalid_response", "AI provider returned an empty completion.", {
      retryable: true,
      attempts: attempt,
    });
  }

  const promptTokens = Number(data?.usage?.prompt_tokens) || 0;
  const completionTokens = Number(data?.usage?.completion_tokens) || 0;
  const resolvedModel = typeof data?.model === "string" ? data.model : model;

  return {
    content,
    model: resolvedModel,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: costOf(resolvedModel, promptTokens, completionTokens),
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Core chat completion with full reliability handling.
 * Returns text plus usage so the caller can persist an audit trail.
 */
export async function aiChatDetailed(
  messages: AIMessage[],
  opts: AIOptions = {}
): Promise<AIResult> {
  if (!AI_GATEWAY_KEY) {
    throw new AIError(
      "not_configured",
      "AI_GATEWAY_API_KEY is not configured. Add it to .env."
    );
  }

  checkRateLimit(opts.bypassRateLimit ?? false);
  checkBudget();

  if (circuitIsOpen()) {
    state().servedByCircuit += 1;
    throw new AIError(
      "circuit_open",
      `The AI provider is failing repeatedly and the circuit breaker is open. Try again in ${Math.ceil(
        (CIRCUIT_OPEN_MS - (Date.now() - state().circuitOpenedAt)) / 1000
      )}s.`,
      { retryable: true }
    );
  }

  const started = Date.now();
  const primary = opts.model || DEFAULT_MODEL;
  const models = FALLBACK_MODEL && FALLBACK_MODEL !== primary ? [primary, FALLBACK_MODEL] : [primary];

  let lastError: AIError | null = null;
  let attempts = 0;

  for (const model of models) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      attempts += 1;
      try {
        const raw = await withConcurrency(() =>
          callProvider(model, messages, opts, attempts)
        );
        recordSuccess();
        const s = state();
        s.tokensToday += raw.usage.totalTokens;
        s.costTodayUsd += raw.usage.costUsd;
        return {
          text: raw.content,
          model: raw.model,
          usage: raw.usage,
          latencyMs: Date.now() - started,
          attempts,
        };
      } catch (err) {
        const e = err instanceof AIError ? err : new AIError("provider_error", String(err));
        lastError = e;
        recordFailure();

        // Non-retryable (bad request, no key, empty response shape): stop.
        if (!e.retryable) break;
        // Only retry on the primary model; a fallback is tried on the next outer loop.
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 250);
          await sleep(backoff);
        }
      }
    }
  }

  throw (
    lastError ??
    new AIError("provider_error", "AI request failed for an unknown reason.", { attempts })
  );
}

/** Back-compatible text-only chat completion. */
export async function aiChat(messages: AIMessage[], opts: AIOptions = {}): Promise<string> {
  const r = await aiChatDetailed(messages, opts);
  return r.text;
}

/** Single user prompt with an optional system prompt. */
export async function aiPrompt(
  userPrompt: string,
  systemPrompt = "You are a helpful business assistant for TaskBoard OS.",
  opts: AIOptions = {}
): Promise<string> {
  return aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    opts
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured output
// ─────────────────────────────────────────────────────────────────────────────

/** Strips markdown fences and leading prose, returning the JSON substring. */
export function extractJson(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) return text;
  const start = Math.min(...starts);
  const closer = text[start] === "{" ? "}" : "]";
  const end = text.lastIndexOf(closer);
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

/**
 * Schema-validated JSON completion.
 *
 * Pass a Zod schema and the output is validated; on failure the model is given
 * ONE repair attempt, and if that also fails the call throws instead of
 * returning garbage. Without a schema it still extracts and parses safely, so
 * a prose response can never surface as an unhandled SyntaxError.
 */
export async function aiJson<T = Record<string, unknown>>(
  userPrompt: string,
  systemPrompt: string,
  opts: AIOptions = {},
  schema?: z.ZodType<T>
): Promise<T> {
  const base: AIOptions = { ...opts, json: true };
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const first = await aiChat(messages, base);
  const parsed = safeParseJson<T>(first, schema);

  if (parsed.ok) return parsed.value;

  if (!schema) {
    throw new AIError(
      "invalid_response",
      `AI response was not valid JSON: ${first.slice(0, 200)}`
    );
  }

  // One repair attempt, told exactly what was wrong.
  const repair = await aiChat(
    [
      ...messages,
      { role: "assistant", content: first.slice(0, 4000) },
      {
        role: "user",
        content:
          `That response was not valid for the required schema.\n` +
          `Problem: ${parsed.error}\n` +
          `Return ONLY corrected JSON that satisfies the schema. No prose, no markdown fences.`,
      },
    ],
    base
  );

  const second = safeParseJson<T>(repair, schema);
  if (second.ok) return second.value;

  throw new AIError(
    "invalid_response",
    `AI response failed schema validation after one repair attempt: ${second.error}`
  );
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function safeParseJson<T>(raw: string, schema?: z.ZodType<T>): ParseResult<T> {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${(err as Error).message}` };
  }
  if (schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return { ok: false, error: `schema validation failed — ${issues}` };
    }
    return { ok: true, value: result.data as T };
  }
  return { ok: true, value: data as T };
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability
// ─────────────────────────────────────────────────────────────────────────────

export interface AIHealth {
  configured: boolean;
  baseUrl: string;
  model: string;
  fallbackModel: string | null;
  circuitOpen: boolean;
  consecutiveFailures: number;
  inflight: number;
  maxConcurrent: number;
  timeoutMs: number;
  maxRetries: number;
  requestsLastMinute: number;
  rateLimitPerMin: number;
  tokensToday: number;
  tokenBudget: number;
  costTodayUsd: number;
  costBudgetUsd: number;
  served: {
    inFlight: number;
    circuit: number;
    budget: number;
    rateLimit: number;
  };
}

export function aiHealth(): AIHealth {
  const s = state();
  const cutoff = Date.now() - 60_000;
  return {
    configured: Boolean(AI_GATEWAY_KEY),
    baseUrl: AI_GATEWAY_BASE,
    model: DEFAULT_MODEL,
    fallbackModel: FALLBACK_MODEL || null,
    circuitOpen: circuitIsOpen(),
    consecutiveFailures: s.consecutiveFailures,
    inflight: s.inflight,
    maxConcurrent: MAX_CONCURRENT,
    timeoutMs: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    requestsLastMinute: s.requestTimestamps.filter((t) => t > cutoff).length,
    rateLimitPerMin: RATE_LIMIT_PER_MIN,
    tokensToday: s.tokensToday,
    tokenBudget: DAILY_TOKEN_BUDGET,
    costTodayUsd: Number(s.costTodayUsd.toFixed(4)),
    costBudgetUsd: DAILY_COST_BUDGET_USD,
    served: {
      inFlight: s.servedByInFlight,
      circuit: s.servedByCircuit,
      budget: s.servedByBudget,
      rateLimit: s.servedByRateLimit,
    },
  };
}

/** Resets the circuit breaker and in-process counters. Intended for ops/tests. */
export function resetAiCircuit() {
  const s = state();
  s.consecutiveFailures = 0;
  s.circuitOpenedAt = 0;
}
