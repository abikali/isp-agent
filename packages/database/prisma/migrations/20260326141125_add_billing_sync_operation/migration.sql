-- CreateTable
CREATE TABLE "billing_sync_operation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "phase" TEXT,
    "totalCustomers" INTEGER NOT NULL DEFAULT 0,
    "processedCustomers" INTEGER NOT NULL DEFAULT 0,
    "totalPayments" INTEGER NOT NULL DEFAULT 0,
    "processedPayments" INTEGER NOT NULL DEFAULT 0,
    "totalCollections" INTEGER NOT NULL DEFAULT 0,
    "processedCollections" INTEGER NOT NULL DEFAULT 0,
    "totalExpenses" INTEGER NOT NULL DEFAULT 0,
    "processedExpenses" INTEGER NOT NULL DEFAULT 0,
    "totalStockItems" INTEGER NOT NULL DEFAULT 0,
    "processedStockItems" INTEGER NOT NULL DEFAULT 0,
    "totalWorkerStock" INTEGER NOT NULL DEFAULT 0,
    "processedWorkerStock" INTEGER NOT NULL DEFAULT 0,
    "totalInstallations" INTEGER NOT NULL DEFAULT 0,
    "processedInstallations" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_sync_operation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_sync_operation_organizationId_idx" ON "billing_sync_operation"("organizationId");

-- AddForeignKey
ALTER TABLE "billing_sync_operation" ADD CONSTRAINT "billing_sync_operation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
