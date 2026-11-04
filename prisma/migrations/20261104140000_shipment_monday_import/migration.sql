-- Shipments imported from the monday.com shipping board: the item it came from (unique, so a re-run links instead of duplicating),
-- the link to it, the shipper, the shipping method and the Files column as links (additive, all nullable).
ALTER TABLE "Shipment" ADD COLUMN "mondayItemId" TEXT,
ADD COLUMN "mondayUrl" TEXT,
ADD COLUMN "shipper" TEXT,
ADD COLUMN "shippingMethod" TEXT,
ADD COLUMN "files" JSONB;

CREATE UNIQUE INDEX "Shipment_mondayItemId_key" ON "Shipment"("mondayItemId");