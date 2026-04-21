-- Link each Payment to the specific CustomerInvoice it satisfies.
--
-- billingCycleId stays on Payment (still useful for per-cycle aggregates
-- and as a fallback for payments predating local invoice generation), but
-- invoiceId is the new primary link. The unique index enforces one Payment
-- per invoice; Postgres treats multiple NULLs as distinct, so historical
-- payments without an invoice match don't collide.

-- AlterTable
ALTER TABLE "payment" ADD COLUMN "invoiceId" TEXT;

-- Backfill: match each payment to its invoice via (customerId, year, month).
-- Payments from before the decouple-invoices-from-iradius migration (which
-- wiped pre-April invoice rows) have no candidate and stay NULL.
UPDATE "payment" p
SET "invoiceId" = ci.id
FROM "customer_invoice" ci
JOIN "billing_cycle" bc
  ON bc."organizationId" = ci."organizationId"
 AND bc.year = ci.year
 AND bc.month = ci.month
WHERE ci."customerId" = p."customerId"
  AND ci."organizationId" = p."organizationId"
  AND bc.id = p."billingCycleId";

-- CreateIndex (unique across non-NULL values per Postgres NULL semantics)
CREATE UNIQUE INDEX "payment_invoiceId_key" ON "payment"("invoiceId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "customer_invoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
