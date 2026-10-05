-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('IMPORTED', 'MANUAL');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SubStage" ADD COLUMN     "completedAt" DATE,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "startedAt" DATE,
ADD COLUMN     "targetDate" DATE;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "slot" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "englishLevel" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'IMPORTED',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL,
    "subStageId" TEXT NOT NULL,
    "fromStatus" "StageStatus",
    "toStatus" "StageStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOwner" (
    "department" "Department" NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "DepartmentOwner_pkey" PRIMARY KEY ("department")
);

-- CreateIndex
CREATE INDEX "Contact_customerId_idx" ON "Contact"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_projectId_slot_key" ON "Contact"("projectId", "slot");

-- CreateIndex
CREATE INDEX "StatusEvent_subStageId_at_idx" ON "StatusEvent"("subStageId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Person_name_key" ON "Person"("name");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubStage" ADD CONSTRAINT "SubStage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_subStageId_fkey" FOREIGN KEY ("subStageId") REFERENCES "SubStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOwner" ADD CONSTRAINT "DepartmentOwner_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
