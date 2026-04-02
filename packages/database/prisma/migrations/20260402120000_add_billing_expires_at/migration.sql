-- AlterTable
ALTER TABLE "customer" ADD COLUMN "billingExpiresAt" TIMESTAMP(3);

-- Initialize billingExpiresAt from expiresAt for all existing customers
UPDATE "customer" SET "billingExpiresAt" = "expiresAt" WHERE "expiresAt" IS NOT NULL;

-- CreateIndex
CREATE INDEX "customer_organizationId_billingExpiresAt_idx" ON "customer"("organizationId", "billingExpiresAt");
