-- CreateTable
CREATE TABLE "billing_employee_mapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billingUsername" TEXT NOT NULL,
    "employeeId" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_employee_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_employee_mapping_organizationId_idx" ON "billing_employee_mapping"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_employee_mapping_organizationId_billingUsername_key" ON "billing_employee_mapping"("organizationId", "billingUsername");

-- AddForeignKey
ALTER TABLE "billing_employee_mapping" ADD CONSTRAINT "billing_employee_mapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_employee_mapping" ADD CONSTRAINT "billing_employee_mapping_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
