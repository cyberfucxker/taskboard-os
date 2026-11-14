-- Add descriptionBy (id of employee who last set the task description).
-- Schema declares it; the column was missing from the DB causing P2022 on /tasks.
-- IF NOT EXISTS keeps this idempotent against the already-patched live DB.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "descriptionBy" TEXT;
