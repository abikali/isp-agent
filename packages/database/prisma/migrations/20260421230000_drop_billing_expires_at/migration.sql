-- Retire Customer.billingExpiresAt.
--
-- The per-customer frozen-billing-expiry snapshot was only necessary because
-- iRadius could mutate `expiresAt` mid-cycle. Now that each billing month's
-- deadline lives on its own customer_invoice.expiryDate row (frozen at
-- generation time, guaranteed fresh by toggleMonthLock's sync-age guard),
-- the customer-level copy adds no information and two write paths to keep
-- in sync.
--
-- Billing readers now join the invoice table; non-billing "is this customer
-- expired?" checks use the live customer.expiresAt (iRadius mirror).

-- DropIndex
DROP INDEX "customer_organizationId_billingExpiresAt_idx";

-- AlterTable
ALTER TABLE "customer" DROP COLUMN "billingExpiresAt";
