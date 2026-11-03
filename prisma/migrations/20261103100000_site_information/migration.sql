-- Site information on the project profile: contact, working hours, unloading and access, GPS (additive, all nullable).
ALTER TABLE "ProjectProfile" ADD COLUMN "siteContactName" TEXT,
ADD COLUMN "siteContactPhone" TEXT,
ADD COLUMN "siteContactEmail" TEXT,
ADD COLUMN "siteHours" TEXT,
ADD COLUMN "siteAccess" TEXT,
ADD COLUMN "siteCoordinates" TEXT;