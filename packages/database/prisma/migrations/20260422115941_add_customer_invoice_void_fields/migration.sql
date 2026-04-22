-- AlterTable
ALTER TABLE "customer_invoice" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateIndex
CREATE INDEX "customer_invoice_voidedAt_idx" ON "customer_invoice"("voidedAt");
