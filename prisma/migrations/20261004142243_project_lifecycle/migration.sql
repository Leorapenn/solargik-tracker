-- CreateEnum
CREATE TYPE "ProjectLifecycle" AS ENUM ('ACTIVE', 'PRE_NTP', 'ON_HOLD', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lifecycle" "ProjectLifecycle" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "mondayStage" TEXT,
ADD COLUMN     "mondayStatus" TEXT;
