-- CreateTable
CREATE TABLE "CheckinState" (
    "employeeId" TEXT NOT NULL,
    "runningTaskId" TEXT,
    "lastAskedAt" TIMESTAMP(3),
    "streakNo" INTEGER NOT NULL DEFAULT 0,
    "askReason" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckinState_pkey" PRIMARY KEY ("employeeId")
);

-- AddForeignKey
ALTER TABLE "CheckinState" ADD CONSTRAINT "CheckinState_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
