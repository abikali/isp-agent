-- AlterEnum
ALTER TYPE "CashCollectionType" ADD VALUE 'SALARY';

-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "source" TEXT;
