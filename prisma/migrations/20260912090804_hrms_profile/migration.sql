-- Additive, nullable HR-profile fields on Employee (HRMS upgrade).
-- No enum/relation changes; all columns nullable -> trivially safe.

ALTER TABLE "Employee" ADD COLUMN "dob" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "personalPhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN "personalEmail" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactPhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN "annualCtc" DECIMAL(18,2);
ALTER TABLE "Employee" ADD COLUMN "exitReason" TEXT;
ALTER TABLE "Employee" ADD COLUMN "devices" JSONB;
ALTER TABLE "Employee" ADD COLUMN "performanceReviews" JSONB;
ALTER TABLE "Employee" ADD COLUMN "toolAccess" JSONB;