-- F1: full Meta/web form answers per lead + cached form definitions. Additive only.
ALTER TABLE "CrmLead" ADD COLUMN IF NOT EXISTS "formAnswers" JSONB;

CREATE TABLE IF NOT EXISTS "CrmFormDefinition" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'meta',
    "name" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmFormDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFormDefinition_formId_key" ON "CrmFormDefinition"("formId");
