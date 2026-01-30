-- CreateIndex for profile-scoped documents
CREATE UNIQUE INDEX "chatbot_document_profileId_sourceUrl_chunkIndex_key" ON "chatbot_document"("profileId", "sourceUrl", "chunkIndex");

-- CreateIndex for organization-scoped shared documents
CREATE UNIQUE INDEX "chatbot_document_organizationId_sourceUrl_chunkIndex_key" ON "chatbot_document"("organizationId", "sourceUrl", "chunkIndex");
