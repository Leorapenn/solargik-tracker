-- A project can now be created in 360 itself (no monday.com item). The unique index stays: several NULLs are allowed.
ALTER TABLE "Project" ALTER COLUMN "mondayItemId" DROP NOT NULL;
