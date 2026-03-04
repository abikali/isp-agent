-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "promptSections" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "ai_agent_tool_config" ADD COLUMN     "promptSection" TEXT;
