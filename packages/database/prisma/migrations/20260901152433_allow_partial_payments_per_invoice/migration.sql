-- DropIndex
DROP INDEX "payment_invoiceId_key";

-- CreateIndex
CREATE INDEX "payment_invoiceId_idx" ON "payment"("invoiceId");
