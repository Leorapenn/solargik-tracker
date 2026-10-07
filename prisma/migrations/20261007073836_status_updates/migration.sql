-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "statusUpdate" TEXT,
ADD COLUMN     "statusUpdateAt" DATE;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "statusSummaryOverride" TEXT;
