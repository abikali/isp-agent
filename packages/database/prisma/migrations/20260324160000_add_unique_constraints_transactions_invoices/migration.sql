-- Remove duplicate customer_transaction records (keep the first by id)
DELETE FROM "customer_transaction" a
USING "customer_transaction" b
WHERE a."id" > b."id"
  AND a."organizationId" = b."organizationId"
  AND a."externalId" = b."externalId"
  AND a."externalId" IS NOT NULL;

-- Remove duplicate customer_invoice records (keep the first by id)
DELETE FROM "customer_invoice" a
USING "customer_invoice" b
WHERE a."id" > b."id"
  AND a."organizationId" = b."organizationId"
  AND a."externalId" = b."externalId"
  AND a."externalId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "customer_transaction_organizationId_externalId_key" ON "customer_transaction"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoice_organizationId_externalId_key" ON "customer_invoice"("organizationId", "externalId");
