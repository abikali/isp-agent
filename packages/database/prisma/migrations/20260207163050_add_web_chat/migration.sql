-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN "webChatEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_agent" ADD COLUMN "webChatToken" TEXT;

-- AlterTable: Make channelId nullable on ai_conversation
ALTER TABLE "ai_conversation" ALTER COLUMN "channelId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_webChatToken_key" ON "ai_agent"("webChatToken");

-- CreateIndex
CREATE INDEX "ai_conversation_agentId_externalChatId_idx" ON "ai_conversation"("agentId", "externalChatId");

-- DropForeignKey (replace with optional)
ALTER TABLE "ai_conversation" DROP CONSTRAINT "ai_conversation_channelId_fkey";

-- AddForeignKey (optional)
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ai_agent_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
