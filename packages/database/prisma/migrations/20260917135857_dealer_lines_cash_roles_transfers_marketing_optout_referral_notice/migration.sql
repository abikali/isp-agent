-- CreateEnum
CREATE TYPE "EmployeeCashRole" AS ENUM ('COLLECTOR', 'WORKER', 'BOTH');

-- AlterTable
ALTER TABLE "cash_collection" ADD COLUMN     "transfer_id" TEXT;

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "cash_role" "EmployeeCashRole";

-- AlterTable
ALTER TABLE "isp_dealer" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "internalLineOfOrganizationId" TEXT,
ADD COLUMN     "whatsappPhone" TEXT;

-- AlterTable
ALTER TABLE "isp_dealer_account" ADD COLUMN     "whatsappNotice" JSONB;

-- AlterTable
ALTER TABLE "marketing_broadcast" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "referralRewardNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "marketing_suppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_suppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_suppression_organizationId_createdAt_idx" ON "marketing_suppression"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_suppression_organizationId_phone_key" ON "marketing_suppression"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "cash_collection_organizationId_transfer_id_idx" ON "cash_collection"("organizationId", "transfer_id");

-- CreateIndex
CREATE INDEX "isp_dealer_internalLineOfOrganizationId_idx" ON "isp_dealer"("internalLineOfOrganizationId");

-- AddForeignKey
ALTER TABLE "isp_dealer" ADD CONSTRAINT "isp_dealer_internalLineOfOrganizationId_fkey" FOREIGN KEY ("internalLineOfOrganizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_suppression" ADD CONSTRAINT "marketing_suppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
