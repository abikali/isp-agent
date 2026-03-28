/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,external_billing_id]` on the table `payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,external_billing_id]` on the table `stock_log` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "external_billing_id" INTEGER;

-- AlterTable
ALTER TABLE "stock_log" ADD COLUMN     "external_billing_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "payment_organizationId_external_billing_id_key" ON "payment"("organizationId", "external_billing_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_log_organizationId_external_billing_id_key" ON "stock_log"("organizationId", "external_billing_id");
