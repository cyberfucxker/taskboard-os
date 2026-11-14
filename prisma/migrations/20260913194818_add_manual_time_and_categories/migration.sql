-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('CALL', 'MEETING', 'SCREENING', 'BUG_FIX', 'DEVELOPMENT', 'DESIGN', 'CRM', 'ADMIN', 'DOCUMENTATION', 'OTHER');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "category" "TaskCategory" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "ManualTimeLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualTimeLog_employeeId_date_idx" ON "ManualTimeLog"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "ManualTimeLog" ADD CONSTRAINT "ManualTimeLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
