-- DropIndex
DROP INDEX "ai_conversation_channelId_externalChatId_key";

-- CreateIndex
CREATE INDEX "ai_conversation_channelId_externalChatId_status_idx" ON "ai_conversation"("channelId", "externalChatId", "status");
