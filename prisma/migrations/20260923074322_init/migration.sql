-- CreateEnum
CREATE TYPE "PhaseName" AS ENUM ('INITIATION', 'DESIGN', 'SUPPLY', 'CONSTRUCTION', 'COMMISSIONING', 'OM');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('FINANCE', 'DESIGN', 'SUPPLY', 'LOGISTICS', 'CONSTRUCTION', 'COMMISSIONING');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mondayItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "CustomerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mondayItemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractValue" DECIMAL(65,30),
    "capacityMw" DECIMAL(65,30),
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" "PhaseName" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "order" INTEGER NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubStageTemplate" (
    "id" TEXT NOT NULL,
    "phase" "PhaseName" NOT NULL,
    "department" "Department" NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SubStageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubStage" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "order" INTEGER NOT NULL,

    CONSTRAINT "SubStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportReviewItem" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "mondayItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "rawCustomerRef" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_mondayItemId_key" ON "Customer"("mondayItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAlias_alias_key" ON "CustomerAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "Project_mondayItemId_key" ON "Project"("mondayItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_projectId_name_key" ON "Phase"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SubStageTemplate_phase_name_key" ON "SubStageTemplate"("phase", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ImportReviewItem_boardId_mondayItemId_key" ON "ImportReviewItem"("boardId", "mondayItemId");

-- AddForeignKey
ALTER TABLE "CustomerAlias" ADD CONSTRAINT "CustomerAlias_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubStage" ADD CONSTRAINT "SubStage_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubStage" ADD CONSTRAINT "SubStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SubStageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
