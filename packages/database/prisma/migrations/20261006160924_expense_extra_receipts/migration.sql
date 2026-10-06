-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "extraReceiptUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
