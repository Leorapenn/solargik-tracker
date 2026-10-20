-- The email chain (conversation) a proposal came from, so the Inbox can show a chain together. Nullable: older proposals have none.
ALTER TABLE "Suggestion" ADD COLUMN "conversationId" TEXT;
CREATE INDEX "Suggestion_conversationId_idx" ON "Suggestion"("conversationId");
