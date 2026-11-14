-- Task Reports (lightweight in-DB file attachments)
-- Replaces Slack file drops: PDFs, images, CSVs, screenshots attached directly
-- to the task they belong to. Files stored as bytea BLOBs (max 10 MB enforced
-- in the API layer). No external storage dependency.

CREATE TYPE "ReportKind" AS ENUM (
  'DAILY_REPORT',
  'WEEKLY_REPORT',
  'DESIGN_REVIEW',
  'BUG_REPORT',
  'GENERAL'
);

CREATE TABLE "TaskReport" (
  "id"          TEXT         NOT NULL,
  "taskId"      TEXT         NOT NULL,
  "authorId"    TEXT,
  "kind"        "ReportKind" NOT NULL DEFAULT 'GENERAL',
  "title"       TEXT         NOT NULL,
  "note"        TEXT,
  "fileName"    TEXT         NOT NULL,
  "mimeType"    TEXT         NOT NULL,
  "sizeBytes"   INTEGER      NOT NULL,
  "data"        BYTEA        NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskReport_taskId_idx" ON "TaskReport"("taskId");
CREATE INDEX "TaskReport_authorId_idx" ON "TaskReport"("authorId");

ALTER TABLE "TaskReport"
  ADD CONSTRAINT "TaskReport_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskReport"
  ADD CONSTRAINT "TaskReport_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
