-- AlterTable
ALTER TABLE "SubStage" ADD COLUMN     "naDates" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SubStageTemplate" ADD COLUMN     "naDates" TEXT[] DEFAULT ARRAY[]::TEXT[];
