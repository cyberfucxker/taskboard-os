-- Records of lead imports, so an admin can see what a migration did without
-- re-reading a CSV, and records of external CRM sync state so a re-run picks up
-- where the last one stopped instead of re-pulling the whole history.

CREATE TABLE IF NOT EXISTS "LeadImportBatch" (
    "id"            TEXT NOT NULL,
    "source"        TEXT NOT NULL,              -- CSV | TELECRM
    "fileName"      TEXT,
    "totalRows"     INTEGER NOT NULL DEFAULT 0,
    "importedRows"  INTEGER NOT NULL DEFAULT 0,
    "updatedRows"   INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows"   INTEGER NOT NULL DEFAULT 0,
    "mapping"       JSONB,
    "conflictPolicy" TEXT NOT NULL DEFAULT 'skip',
    "dryRun"        BOOLEAN NOT NULL DEFAULT false,
    "status"        TEXT NOT NULL DEFAULT 'completed',  -- completed | failed
    "error"         TEXT,
    "createdById"   TEXT,
    "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"    TIMESTAMP(3),
    CONSTRAINT "LeadImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadImportBatch_startedAt_idx" ON "LeadImportBatch"("startedAt" DESC);

-- Sync cursors. TeleCRM's search endpoint is exact-match only with no date
-- filter, so a high-water mark plus phone/email dedupe is what keeps a nightly
-- job from creating the whole database again every night.
CREATE TABLE IF NOT EXISTS "CrmSyncCheckpoint" (
    "id"            TEXT NOT NULL,
    "provider"      TEXT NOT NULL,
    "cursor"        TEXT,
    "lastRunAt"     TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus"    TEXT,                       -- ok | error
    "lastError"     TEXT,
    "lastCount"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmSyncCheckpoint_provider_key" ON "CrmSyncCheckpoint"("provider");
