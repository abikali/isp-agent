-- DropIndex
DROP INDEX "chatbot_document_search_vector_idx";

-- AlterTable
ALTER TABLE "chatbot_document" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';
