/*
  Warnings:

  - A unique constraint covering the columns `[setupRequestId]` on the table `cash_collection` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "cash_collection" ADD COLUMN     "setupRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cash_collection_setupRequestId_key" ON "cash_collection"("setupRequestId");

-- AddForeignKey
ALTER TABLE "cash_collection" ADD CONSTRAINT "cash_collection_setupRequestId_fkey" FOREIGN KEY ("setupRequestId") REFERENCES "customer_setup_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
