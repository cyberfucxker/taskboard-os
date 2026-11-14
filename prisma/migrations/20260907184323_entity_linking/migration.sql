-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'CLIENT_UPDATED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "ClientOwner" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientOwner_clientId_idx" ON "ClientOwner"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientOwner_clientId_ownerId_key" ON "ClientOwner"("clientId", "ownerId");

-- AddForeignKey
ALTER TABLE "ClientOwner" ADD CONSTRAINT "ClientOwner_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOwner" ADD CONSTRAINT "ClientOwner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
