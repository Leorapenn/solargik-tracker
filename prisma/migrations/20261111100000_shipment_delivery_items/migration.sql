-- Shipments: which Supply Delivery sub-stages the goods belong to, and whether monday.com flags it as a completion shipment (additive).
ALTER TABLE "Shipment" ADD COLUMN "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "completionShipment" BOOLEAN NOT NULL DEFAULT false;