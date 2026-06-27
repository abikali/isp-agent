-- CreateTable
CREATE TABLE "base" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_employee" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "base_employee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "base_organizationId_idx" ON "base"("organizationId");

-- CreateIndex
CREATE INDEX "base_dealerId_idx" ON "base"("dealerId");

-- CreateIndex
CREATE INDEX "base_employee_baseId_idx" ON "base_employee"("baseId");

-- CreateIndex
CREATE INDEX "base_employee_employeeId_idx" ON "base_employee"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "base_employee_baseId_employeeId_key" ON "base_employee"("baseId", "employeeId");

-- AddForeignKey
ALTER TABLE "base" ADD CONSTRAINT "base_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base" ADD CONSTRAINT "base_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "isp_dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_employee" ADD CONSTRAINT "base_employee_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_employee" ADD CONSTRAINT "base_employee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
