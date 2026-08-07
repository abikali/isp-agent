/*
  Warnings:

  - A unique constraint covering the columns `[installationId]` on the table `cash_collection` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "cash_collection" ADD COLUMN     "installationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cash_collection_installationId_key" ON "cash_collection"("installationId");

-- AddForeignKey
ALTER TABLE "cash_collection" ADD CONSTRAINT "cash_collection_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
