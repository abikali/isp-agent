-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "referredCustomerId" TEXT;

-- CreateIndex
CREATE INDEX "payment_referredCustomerId_idx" ON "payment"("referredCustomerId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_referredCustomerId_fkey" FOREIGN KEY ("referredCustomerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
