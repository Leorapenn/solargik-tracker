-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "Suggestion_customerId_idx" ON "Suggestion"("customerId");

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
