/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `isp_dealer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `isp_dealer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalId]` on the table `isp_dealer_account` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "isp_dealer" DROP CONSTRAINT "isp_dealer_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "isp_dealer_account" DROP CONSTRAINT "isp_dealer_account_organizationId_fkey";

-- DropIndex
DROP INDEX "isp_dealer_organizationId_email_key";

-- DropIndex
DROP INDEX "isp_dealer_organizationId_externalId_key";

-- DropIndex
DROP INDEX "isp_dealer_account_organizationId_externalId_key";

-- AlterTable
ALTER TABLE "iradius_sync_operation" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "isp_dealer" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "isp_dealer_account" ALTER COLUMN "organizationId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "isp_dealer_externalId_key" ON "isp_dealer"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "isp_dealer_email_key" ON "isp_dealer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "isp_dealer_account_externalId_key" ON "isp_dealer_account"("externalId");

-- AddForeignKey
ALTER TABLE "isp_dealer" ADD CONSTRAINT "isp_dealer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_dealer_account" ADD CONSTRAINT "isp_dealer_account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
