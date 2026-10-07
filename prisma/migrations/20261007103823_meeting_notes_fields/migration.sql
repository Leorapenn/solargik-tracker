-- AlterTable
ALTER TABLE "ChangeOrder" ADD COLUMN     "invoiceLink" TEXT,
ADD COLUMN     "payslipLink" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "invoiceLink" TEXT,
ADD COLUMN     "payslipLink" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customerManagerEmail" TEXT,
ADD COLUMN     "customerManagerName" TEXT,
ADD COLUMN     "customerManagerPhone" TEXT,
ADD COLUMN     "flagColors" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ProjectProfile" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "shippingAddress" TEXT;
