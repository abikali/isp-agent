-- AlterTable
ALTER TABLE "ai_agent" DROP COLUMN IF EXISTS "humanTakeoverHours";

-- AlterTable
ALTER TABLE "ai_conversation" DROP COLUMN IF EXISTS "humanTakeoverAt";
