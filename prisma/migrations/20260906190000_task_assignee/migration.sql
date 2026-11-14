-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_employeeId_key" ON "TaskAssignee"("taskId", "employeeId");

-- CreateIndex
CREATE INDEX "TaskAssignee_employeeId_idx" ON "TaskAssignee"("employeeId");

-- Seed: populate TaskAssignee from existing Task.assigneeId (backward compat)
INSERT INTO "TaskAssignee" ("id", "taskId", "employeeId", "createdAt")
SELECT
  concat('seed-', "id") AS "id",
  "id" AS "taskId",
  "assigneeId" AS "employeeId",
  CURRENT_TIMESTAMP AS "createdAt"
FROM "Task"
WHERE "assigneeId" IS NOT NULL
  AND "deletedAt" IS NULL
ON CONFLICT ("taskId", "employeeId") DO NOTHING;
