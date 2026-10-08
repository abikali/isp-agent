-- CreateIndex
CREATE INDEX "ai_message_createdAt_idx" ON "ai_message"("createdAt");

-- CreateIndex
CREATE INDEX "marketing_broadcast_recipient_phone_sentAt_idx" ON "marketing_broadcast_recipient"("phone", "sentAt");

-- CreateIndex
CREATE INDEX "task_source_createdAt_idx" ON "task"("source", "createdAt");
