-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "PhaseDefaultOwner" (
    "phase" "PhaseName" NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "PhaseDefaultOwner_pkey" PRIMARY KEY ("phase")
);

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseDefaultOwner" ADD CONSTRAINT "PhaseDefaultOwner_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
