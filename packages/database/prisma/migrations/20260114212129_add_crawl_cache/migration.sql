-- DropIndex
DROP INDEX "chatbot_document_embedding_idx";

-- CreateTable
CREATE TABLE "crawl_cache" (
    "id" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawl_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crawl_cache_urlHash_key" ON "crawl_cache"("urlHash");

-- CreateIndex
CREATE INDEX "crawl_cache_expiresAt_idx" ON "crawl_cache"("expiresAt");
