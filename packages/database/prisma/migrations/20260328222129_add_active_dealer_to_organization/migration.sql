/*
  Warnings:

  - A unique constraint covering the columns `[activeDealerId]` on the table `organization` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "activeDealerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organization_activeDealerId_key" ON "organization"("activeDealerId");

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_activeDealerId_fkey" FOREIGN KEY ("activeDealerId") REFERENCES "isp_dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
