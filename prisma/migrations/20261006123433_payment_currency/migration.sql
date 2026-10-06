-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "paymentBase" DECIMAL(14,2),
ADD COLUMN     "paymentCurrency" TEXT NOT NULL DEFAULT 'USD';
