-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "pageAccess" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;

-- CreateTable
CREATE TABLE "TimeLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeLog_employeeId_date_idx" ON "TimeLog"("employeeId", "date");

-- CreateIndex
CREATE INDEX "TimeLog_taskId_idx" ON "TimeLog"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeLog_taskId_employeeId_date_key" ON "TimeLog"("taskId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "TaskDependency_dependsOnId_idx" ON "TaskDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_taskId_dependsOnId_key" ON "TaskDependency"("taskId", "dependsOnId");

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Backfill existing employees' pageAccess from their CURRENT capability set.
-- Maps the pre-page RBAC (base role ⊕ department add-ons) to the pages those
-- capabilities unlocked, so nobody is locked out on rollout. New employees keep
-- the default [] (= no pages) — the COO grants explicitly on the Access page.
-- Mirrors: src/lib/pages.ts PAGE_CAPS + src/lib/rbac.ts BASE / DEPT_ADDONS.
-- =============================================================================
UPDATE "Employee" e
SET "pageAccess" = COALESCE(
  ARRAY(
    SELECT p.page
    FROM (VALUES
      ('Overview'),('Tasks'),('Standup'),('CRM'),('Directory'),('Catalog'),('Deals'),
      ('SEO'),('SMM'),('PerfMktg'),('Tech'),('Design'),('HRMS'),('Finance'),('AI'),('Access')
    ) AS p(page)
    WHERE
      (p.page IN ('Overview','AI') AND (e.role IN ('SUPER_ADMIN','DEPARTMENT_HEAD')
          OR EXISTS (SELECT 1 FROM "Department" d WHERE d.id = e."departmentId" AND d.slug = 'leadership')))
      OR (p.page IN ('Tasks','Standup','Tech','Design') AND e.role NOT IN ('CLIENT_ADMIN','CLIENT_VIEWER'))
      OR (p.page IN ('CRM','SEO','SMM','PerfMktg') AND (e.role IN ('SUPER_ADMIN','DEPARTMENT_HEAD','TEAM_LEAD','ACCOUNT_MANAGER')
          OR EXISTS (SELECT 1 FROM "Department" d WHERE d.id = e."departmentId" AND d.slug IN ('leadership','sales'))))
      OR (p.page = 'Directory' AND e.role IN ('SUPER_ADMIN','DEPARTMENT_HEAD','TEAM_LEAD','SENIOR_EXECUTIVE','ACCOUNT_MANAGER','HR','FINANCE'))
      OR (p.page = 'Catalog' AND e.role IN ('SUPER_ADMIN','DEPARTMENT_HEAD','TEAM_LEAD','SENIOR_EXECUTIVE','EXECUTIVE','INTERN','ACCOUNT_MANAGER','FINANCE'))
      OR (p.page = 'Deals' AND (e.role IN ('SUPER_ADMIN','ACCOUNT_MANAGER')
          OR EXISTS (SELECT 1 FROM "Department" d WHERE d.id = e."departmentId" AND d.slug IN ('leadership','sales'))))
      OR (p.page = 'HRMS' AND e.role IN ('SUPER_ADMIN','DEPARTMENT_HEAD','HR'))
      OR (p.page = 'Finance' AND (e.role IN ('SUPER_ADMIN','FINANCE')
          OR EXISTS (SELECT 1 FROM "Department" d WHERE d.id = e."departmentId" AND d.slug IN ('leadership','finance'))))
      OR (p.page = 'Access' AND e.role = 'SUPER_ADMIN')
  ), '{}'::TEXT[])
WHERE e."deletedAt" IS NULL;
