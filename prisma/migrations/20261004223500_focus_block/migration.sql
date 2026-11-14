-- T8 Focus block: an employee can run up to 3 ranked tasks under ONE combined timer.
-- Additive only: a new table. TaskWorkSession is untouched and stays the single
-- source of per-task time; the block only decides which task holds the open session.

CREATE TABLE IF NOT EXISTS "FocusBlock" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "taskIds"      TEXT[],
    "activeTaskId" TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"      TIMESTAMP(3),

    CONSTRAINT "FocusBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FocusBlock_employeeId_idx" ON "FocusBlock"("employeeId");
CREATE INDEX IF NOT EXISTS "FocusBlock_endedAt_idx" ON "FocusBlock"("endedAt");

-- The single-track invariant, enforced by the database and not only by app code:
-- at most one OPEN block per employee (endedAt IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "FocusBlock_one_open_per_employee"
    ON "FocusBlock"("employeeId") WHERE "endedAt" IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FocusBlock_employeeId_fkey'
    ) THEN
        ALTER TABLE "FocusBlock"
            ADD CONSTRAINT "FocusBlock_employeeId_fkey"
            FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;