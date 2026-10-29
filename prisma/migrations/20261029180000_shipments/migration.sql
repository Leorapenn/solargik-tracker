-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "goods" TEXT,
    "forwarder" TEXT,
    "vessel" TEXT,
    "containers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "customsStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "etd" DATE,
    "eta" DATE,
    "arrivedAt" DATE,
    "customsClearedAt" DATE,
    "deliveryDate" DATE,
    "deliveredAt" DATE,
    "notes" TEXT,
    "sourceLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shipment_projectId_idx" ON "Shipment"("projectId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
