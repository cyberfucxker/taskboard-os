-- Integration hub: per-employee provider connections, external activity
-- attribution, cached company answers, and per-department recommendations.
-- Generated with prisma migrate diff (live schema -> hub schema); touches only
-- these four new tables, their indexes, uniques and foreign keys.

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "displayName" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "statusDetail" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActivity" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "connectionId" TEXT,
    "employeeId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "detail" TEXT,
    "url" TEXT,
    "additions" INTEGER,
    "deletions" INTEGER,
    "filesChanged" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightCache" (
    "id" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerJson" JSONB NOT NULL,
    "model" TEXT,
    "dataAsOf" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentIntegration" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "headline" TEXT,
    "whyItMatters" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_employeeId_idx" ON "IntegrationConnection"("employeeId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_provider_idx" ON "IntegrationConnection"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_employeeId_provider_key" ON "IntegrationConnection"("employeeId", "provider");

-- CreateIndex
CREATE INDEX "ExternalActivity_employeeId_occurredAt_idx" ON "ExternalActivity"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ExternalActivity_projectId_occurredAt_idx" ON "ExternalActivity"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "ExternalActivity_kind_occurredAt_idx" ON "ExternalActivity"("kind", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalActivity_provider_providerEventId_key" ON "ExternalActivity"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "InsightCache_questionKey_key" ON "InsightCache"("questionKey");

-- CreateIndex
CREATE INDEX "InsightCache_scope_generatedAt_idx" ON "InsightCache"("scope", "generatedAt");

-- CreateIndex
CREATE INDEX "DepartmentIntegration_departmentId_priority_idx" ON "DepartmentIntegration"("departmentId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentIntegration_departmentId_provider_key" ON "DepartmentIntegration"("departmentId", "provider");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActivity" ADD CONSTRAINT "ExternalActivity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActivity" ADD CONSTRAINT "ExternalActivity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentIntegration" ADD CONSTRAINT "DepartmentIntegration_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

