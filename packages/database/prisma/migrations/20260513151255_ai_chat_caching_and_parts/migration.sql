-- AlterTable
ALTER TABLE "ai_agent" ALTER COLUMN "temperature" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "ai_message" ADD COLUMN     "cacheReadTokens" INTEGER,
ADD COLUMN     "cacheWriteTokens" INTEGER,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "parts" JSONB;
