-- CreateEnum
CREATE TYPE "ResourceLinkType" AS ENUM ('DRIVE_LINK', 'GOOGLE_SHEET', 'NOTION_DOC', 'FIGMA', 'API_PORTAL', 'SOP_GUIDE', 'CREDENTIAL_BOOKMARK');

-- CreateTable
CREATE TABLE "DepartmentResource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "departmentSlug" TEXT NOT NULL,
    "linkType" "ResourceLinkType" NOT NULL DEFAULT 'DRIVE_LINK',
    "url" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "addedById" TEXT,
    "addedByName" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DepartmentResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentResource_departmentSlug_idx" ON "DepartmentResource"("departmentSlug");

-- CreateIndex
CREATE INDEX "DepartmentResource_pinned_idx" ON "DepartmentResource"("pinned");

