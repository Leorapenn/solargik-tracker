-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];
