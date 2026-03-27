-- AlterTable
ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "preferred_layout" TEXT NOT NULL DEFAULT 'standard';

-- CreateIndex (catch up with schema drift from previous migrations)
CREATE UNIQUE INDEX IF NOT EXISTS "customer_organizationId_email_key" ON "customer"("organizationId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "employee_organizationId_email_key" ON "employee"("organizationId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "isp_dealer_organizationId_email_key" ON "isp_dealer"("organizationId", "email");
