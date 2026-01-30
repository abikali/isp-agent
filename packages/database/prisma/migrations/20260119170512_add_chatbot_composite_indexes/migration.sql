-- CreateIndex
CREATE INDEX "chatbot_document_profileId_status_idx" ON "chatbot_document"("profileId", "status");

-- CreateIndex
CREATE INDEX "chatbot_session_profileId_startedAt_idx" ON "chatbot_session"("profileId", "startedAt");

-- CreateIndex
CREATE INDEX "chatbot_session_profileId_visitorId_idx" ON "chatbot_session"("profileId", "visitorId");
