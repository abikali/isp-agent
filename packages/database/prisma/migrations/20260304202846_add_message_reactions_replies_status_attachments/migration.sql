-- AlterTable
ALTER TABLE "ai_message" ADD COLUMN     "attachmentFilename" TEXT,
ADD COLUMN     "attachmentMeta" JSONB,
ADD COLUMN     "attachmentMimeType" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentType" TEXT,
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStatus" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "replyToId" TEXT;

-- CreateTable
CREATE TABLE "ai_message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_message_reaction_messageId_idx" ON "ai_message_reaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_message_reaction_messageId_userId_key" ON "ai_message_reaction"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_message_reaction_messageId_contactId_key" ON "ai_message_reaction"("messageId", "contactId");

-- CreateIndex
CREATE INDEX "ai_message_externalMsgId_idx" ON "ai_message"("externalMsgId");

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ai_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message_reaction" ADD CONSTRAINT "ai_message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
