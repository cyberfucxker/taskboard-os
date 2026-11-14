-- =============================================================================
-- Agent run audit trail + durable AI usage accounting
--
-- Why: the AI layer could call a model and throw the result away. AgentRun had
-- no record of WHO invoked it, how many tokens it cost, how long it took, or
-- why it failed, so AI activity was unreviewable and unauditable. There was
-- also no durable usage table, so any budget would have been in-process only
-- and would reset on every restart.
-- =============================================================================

-- ── AgentRun: who, from where, how much, how long, what happened ─────────────
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "principalId"   TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "source"        TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "promptTokens"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "latencyMs"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "attempts"         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "error"            TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "errorKind"        TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "finishedAt"       TIMESTAMP(3);
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "costUsd"          DECIMAL(18,6);

CREATE INDEX IF NOT EXISTS "AgentRun_principalId_createdAt_idx" ON "AgentRun"("principalId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_status_createdAt_idx"      ON "AgentRun"("status", "createdAt");

-- ── Durable daily usage, so budgets survive a restart and span processes ─────
CREATE TABLE IF NOT EXISTS "AiUsageDaily" (
    "day"               TEXT        NOT NULL,
    "calls"             INTEGER     NOT NULL DEFAULT 0,
    "failures"          INTEGER     NOT NULL DEFAULT 0,
    "promptTokens"      INTEGER     NOT NULL DEFAULT 0,
    "completionTokens"  INTEGER     NOT NULL DEFAULT 0,
    "totalTokens"       INTEGER     NOT NULL DEFAULT 0,
    "costUsd"           DECIMAL(18,6) NOT NULL DEFAULT 0,
    "budgetBlocked"     INTEGER     NOT NULL DEFAULT 0,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("day")
);

-- A day is written by whichever request observes it first.
INSERT INTO "AiUsageDaily" ("day") VALUES (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
ON CONFLICT ("day") DO NOTHING;
