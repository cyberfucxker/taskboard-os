-- Backfill dept slugs from the seeded department names before making the column required.
ALTER TABLE "Department" ADD COLUMN "slug" TEXT;
UPDATE "Department" SET "slug" = lower("name");
ALTER TABLE "Department" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Department" ADD CONSTRAINT "Department_orgId_slug_key" UNIQUE ("orgId","slug");
ALTER TABLE "Employee" ADD COLUMN "accessOverrides" JSONB;
