/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,externalId]` on the table `dealer_charge` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "dealer_charge_externalId_key";

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "isWholesaleOperator" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "dealer_charge_organizationId_externalId_key" ON "dealer_charge"("organizationId", "externalId");
