-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashCollectionType" ADD VALUE 'STOCK_RECEIVED';
ALTER TYPE "CashCollectionType" ADD VALUE 'INSTALLATION_COST';
ALTER TYPE "CashCollectionType" ADD VALUE 'DEALER_PAYMENT';
ALTER TYPE "CashCollectionType" ADD VALUE 'ADMIN_TRANSFER';
ALTER TYPE "CashCollectionType" ADD VALUE 'NEW_USER_SETUP';
ALTER TYPE "CashCollectionType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "workerId" TEXT;

-- CreateIndex
CREATE INDEX "payment_workerId_idx" ON "payment"("workerId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
