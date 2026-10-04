-- CreateEnum
CREATE TYPE "CustomerImportance" AS ENUM ('NORMAL', 'SEMI_STRATEGIC', 'STRATEGIC');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "importance" "CustomerImportance" NOT NULL DEFAULT 'NORMAL';
