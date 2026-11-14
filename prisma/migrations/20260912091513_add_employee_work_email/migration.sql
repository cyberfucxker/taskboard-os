-- Additive, nullable work-email column on Employee (HRMS upgrade, part 2).

ALTER TABLE "Employee" ADD COLUMN "workEmail" TEXT;