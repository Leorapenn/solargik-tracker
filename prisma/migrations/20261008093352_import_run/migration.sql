-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "importRunId" TEXT;

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,
    "emailsChecked" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_ranAt_idx" ON "ImportRun"("ranAt");

-- CreateIndex
CREATE INDEX "Suggestion_importRunId_idx" ON "Suggestion"("importRunId");

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
