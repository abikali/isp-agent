/*
  Warnings:

  - You are about to drop the `ai_credit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ai_credit_transaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ai_usage_event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chatbot_document` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chatbot_message` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chatbot_session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `crawl_cache` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `geocoding_job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_catalog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile_analytics_event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile_lead` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile_link` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile_template` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ai_credit" DROP CONSTRAINT "ai_credit_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ai_credit_transaction" DROP CONSTRAINT "ai_credit_transaction_creditId_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_event" DROP CONSTRAINT "ai_usage_event_creditId_fkey";

-- DropForeignKey
ALTER TABLE "chatbot_document" DROP CONSTRAINT "chatbot_document_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "chatbot_document" DROP CONSTRAINT "chatbot_document_profileId_fkey";

-- DropForeignKey
ALTER TABLE "chatbot_message" DROP CONSTRAINT "chatbot_message_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "chatbot_session" DROP CONSTRAINT "chatbot_session_leadId_fkey";

-- DropForeignKey
ALTER TABLE "chatbot_session" DROP CONSTRAINT "chatbot_session_profileId_fkey";

-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_assignedUserId_fkey";

-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_catalogId_fkey";

-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_linkedProfileId_fkey";

-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "profile" DROP CONSTRAINT "profile_createdById_fkey";

-- DropForeignKey
ALTER TABLE "profile" DROP CONSTRAINT "profile_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "profile" DROP CONSTRAINT "profile_redirectLinkId_fkey";

-- DropForeignKey
ALTER TABLE "profile_analytics_event" DROP CONSTRAINT "profile_analytics_event_linkId_fkey";

-- DropForeignKey
ALTER TABLE "profile_analytics_event" DROP CONSTRAINT "profile_analytics_event_profileId_fkey";

-- DropForeignKey
ALTER TABLE "profile_lead" DROP CONSTRAINT "profile_lead_createdById_fkey";

-- DropForeignKey
ALTER TABLE "profile_lead" DROP CONSTRAINT "profile_lead_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "profile_lead" DROP CONSTRAINT "profile_lead_profileId_fkey";

-- DropForeignKey
ALTER TABLE "profile_link" DROP CONSTRAINT "profile_link_profileId_fkey";

-- DropForeignKey
ALTER TABLE "profile_template" DROP CONSTRAINT "profile_template_createdById_fkey";

-- DropForeignKey
ALTER TABLE "profile_template" DROP CONSTRAINT "profile_template_organizationId_fkey";

-- DropTable
DROP TABLE "ai_credit";

-- DropTable
DROP TABLE "ai_credit_transaction";

-- DropTable
DROP TABLE "ai_usage_event";

-- DropTable
DROP TABLE "chatbot_document";

-- DropTable
DROP TABLE "chatbot_message";

-- DropTable
DROP TABLE "chatbot_session";

-- DropTable
DROP TABLE "crawl_cache";

-- DropTable
DROP TABLE "geocoding_job";

-- DropTable
DROP TABLE "product";

-- DropTable
DROP TABLE "product_catalog";

-- DropTable
DROP TABLE "profile";

-- DropTable
DROP TABLE "profile_analytics_event";

-- DropTable
DROP TABLE "profile_lead";

-- DropTable
DROP TABLE "profile_link";

-- DropTable
DROP TABLE "profile_template";

-- DropEnum
DROP TYPE "ProductCategory";

-- DropEnum
DROP TYPE "ProductColor";

-- DropEnum
DROP TYPE "ProductMaterial";

-- DropEnum
DROP TYPE "ProductStatus";

-- CreateTable
CREATE TABLE "ai_agent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "greetingMessage" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "knowledgeBase" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxHistoryLength" INTEGER NOT NULL DEFAULT 20,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_channel" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "encryptedApiToken" TEXT NOT NULL,
    "providerMetadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "externalMsgId" TEXT,
    "tokenCount" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_agent_organizationId_idx" ON "ai_agent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_channel_webhookToken_key" ON "ai_agent_channel"("webhookToken");

-- CreateIndex
CREATE INDEX "ai_agent_channel_agentId_idx" ON "ai_agent_channel"("agentId");

-- CreateIndex
CREATE INDEX "ai_conversation_agentId_idx" ON "ai_conversation"("agentId");

-- CreateIndex
CREATE INDEX "ai_conversation_channelId_idx" ON "ai_conversation"("channelId");

-- CreateIndex
CREATE INDEX "ai_conversation_lastMessageAt_idx" ON "ai_conversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_channelId_externalChatId_key" ON "ai_conversation"("channelId", "externalChatId");

-- CreateIndex
CREATE INDEX "ai_message_conversationId_createdAt_idx" ON "ai_message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_channel" ADD CONSTRAINT "ai_agent_channel_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ai_agent_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
