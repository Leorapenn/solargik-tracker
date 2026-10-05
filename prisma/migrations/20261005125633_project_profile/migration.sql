-- CreateTable
CREATE TABLE "ProjectProfile" (
    "projectId" TEXT NOT NULL,
    "pileDrivingStart" TIMESTAMP(3),
    "deliveryExpectations" TEXT,
    "supplyTerms" TEXT,
    "supplyObligations" TEXT,
    "soilTest" TEXT,
    "intercoms" TEXT,
    "soma" TEXT,
    "contractSigningDate" TIMESTAMP(3),
    "ntpDate" TIMESTAMP(3),
    "projectType" TEXT,
    "contractLink" TEXT,
    "projectEngineerId" TEXT,
    "designNotes" TEXT,
    "designQuestionnaireReceived" TIMESTAMP(3),
    "designInfoStatus" TEXT,
    "geotechStatus" TEXT,
    "initialLayoutSent" TIMESTAMP(3),
    "genioCivileStatus" TEXT,
    "bomStatus" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProfile_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "ProjectProfile" ADD CONSTRAINT "ProjectProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProfile" ADD CONSTRAINT "ProjectProfile_projectEngineerId_fkey" FOREIGN KEY ("projectEngineerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
