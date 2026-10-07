-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "projectId" TEXT,
    "projectRef" TEXT,
    "summary" TEXT NOT NULL,
    "evidence" TEXT,
    "sourceFrom" TEXT,
    "sourceSubject" TEXT,
    "sourceReceivedAt" TIMESTAMP(3),
    "sourceLink" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_externalId_key" ON "Suggestion"("externalId");

-- CreateIndex
CREATE INDEX "Suggestion_status_createdAt_idx" ON "Suggestion"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
