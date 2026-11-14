-- Lead import support: new sources for bulk CSV / TeleCRM migration, plus
-- normalised identity columns so dedupe can actually work.
--
-- Split into its own file on purpose: Postgres will not let you *use* an enum
-- value added by ALTER TYPE ... ADD VALUE inside the same transaction. Keeping
-- it isolated means a later migration can safely depend on IMPORTED/TELECRM.

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- Postgres. IF NOT EXISTS keeps this re-runnable.
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'IMPORTED';
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'TELECRM';

-- Normalised phone/email used for cross-source dedupe.
--
-- Deliberately NOT unique. A unique index here would turn "two leads share a
-- business phone number" into a P2002 insert failure, and in the Meta webhook
-- that surfaces as a 500 -> Meta retries forever -> the lead is never captured.
-- Identity is enforced in the importer, which reports conflicts instead of
-- blowing up a live webhook.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_phoneNormalized_idx" ON "Lead"("phoneNormalized");
CREATE INDEX IF NOT EXISTS "Lead_emailNormalized_idx" ON "Lead"("emailNormalized");
