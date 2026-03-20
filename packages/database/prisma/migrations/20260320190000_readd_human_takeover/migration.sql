-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN "human_takeover_hours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ai_conversation" ADD COLUMN "human_takeover_at" TIMESTAMP(3);
