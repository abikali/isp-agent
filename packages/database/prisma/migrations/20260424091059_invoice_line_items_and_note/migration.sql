-- AlterTable
ALTER TABLE "customer_invoice" ADD COLUMN     "accountPrice" DOUBLE PRECISION,
ADD COLUMN     "iptvPrice" DOUBLE PRECISION,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "realIpPrice" DOUBLE PRECISION;
