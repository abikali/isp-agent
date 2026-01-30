-- DropIndex
DROP INDEX "chatbot_document_embedding_idx";

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "aiAllowedModels" TEXT[] DEFAULT ARRAY[]::TEXT[];
