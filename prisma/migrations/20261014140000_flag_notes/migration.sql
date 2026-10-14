-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "flagNotes" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "flagNotes" JSONB NOT NULL DEFAULT '{}';
