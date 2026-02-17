-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "enabledTools" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ai_message" ADD COLUMN     "toolCalls" JSONB;

-- CreateTable
CREATE TABLE "ai_agent_tool_config" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_tool_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_captured_lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai_agent',
    "exportedToCrm" BOOLEAN NOT NULL DEFAULT false,
    "crmExportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_captured_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_agent_tool_config_agentId_idx" ON "ai_agent_tool_config"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_tool_config_agentId_toolId_key" ON "ai_agent_tool_config"("agentId", "toolId");

-- CreateIndex
CREATE INDEX "ai_captured_lead_organizationId_idx" ON "ai_captured_lead"("organizationId");

-- CreateIndex
CREATE INDEX "ai_captured_lead_agentId_idx" ON "ai_captured_lead"("agentId");

-- CreateIndex
CREATE INDEX "ai_captured_lead_conversationId_idx" ON "ai_captured_lead"("conversationId");

-- AddForeignKey
ALTER TABLE "ai_agent_tool_config" ADD CONSTRAINT "ai_agent_tool_config_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_captured_lead" ADD CONSTRAINT "ai_captured_lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_captured_lead" ADD CONSTRAINT "ai_captured_lead_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_captured_lead" ADD CONSTRAINT "ai_captured_lead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
