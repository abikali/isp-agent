-- CreateEnum
CREATE TYPE "task_source" AS ENUM ('MANUAL', 'AI_ESCALATION');

-- AlterTable
ALTER TABLE "task" ADD COLUMN "conversationId" TEXT,
ADD COLUMN "source" "task_source" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "createdById" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "task" DROP CONSTRAINT "task_createdById_fkey";

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "task_conversationId_idx" ON "task"("conversationId");
