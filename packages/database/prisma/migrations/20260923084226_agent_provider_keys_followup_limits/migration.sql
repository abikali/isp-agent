-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "encryptedApiKey" TEXT,
ADD COLUMN     "followUpMaxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "followUpRepeatMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "followUpWeeklyCap" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "followUpWindowEnd" TEXT NOT NULL DEFAULT '20:30',
ADD COLUMN     "followUpWindowStart" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'openrouter';

-- AlterTable
ALTER TABLE "ai_conversation" ADD COLUMN     "follow_up_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "follow_up_due_at" TIMESTAMP(3),
ADD COLUMN     "follow_up_muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "follow_up_outcome" TEXT,
ADD COLUMN     "follow_up_outcome_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ai_message" ADD COLUMN     "isFollowUp" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ai_conversation_follow_up_due_at_idx" ON "ai_conversation"("follow_up_due_at");
