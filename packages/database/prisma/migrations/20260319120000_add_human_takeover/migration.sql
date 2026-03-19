-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN "humanTakeoverHours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ai_conversation" ADD COLUMN "humanTakeoverAt" TIMESTAMP(3);
