-- AlterTable
ALTER TABLE "billing_sync_operation" ADD COLUMN     "processedReconciled" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalReconciled" INTEGER NOT NULL DEFAULT 0;
