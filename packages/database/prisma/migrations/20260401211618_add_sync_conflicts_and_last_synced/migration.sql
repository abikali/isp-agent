-- AlterTable
ALTER TABLE "access_point" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customer_invoice" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customer_transaction" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "iradius_sync_operation" ADD COLUMN     "resolvedConflicts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalConflicts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "isp_dealer" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "isp_nas" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "isp_router" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_plan" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "station" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sync_conflict" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncOperationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_conflict_organizationId_status_idx" ON "sync_conflict"("organizationId", "status");

-- CreateIndex
CREATE INDEX "sync_conflict_syncOperationId_idx" ON "sync_conflict"("syncOperationId");

-- CreateIndex
CREATE INDEX "sync_conflict_customerId_idx" ON "sync_conflict"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "sync_conflict_syncOperationId_customerId_key" ON "sync_conflict"("syncOperationId", "customerId");

-- AddForeignKey
ALTER TABLE "sync_conflict" ADD CONSTRAINT "sync_conflict_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflict" ADD CONSTRAINT "sync_conflict_syncOperationId_fkey" FOREIGN KEY ("syncOperationId") REFERENCES "iradius_sync_operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflict" ADD CONSTRAINT "sync_conflict_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflict" ADD CONSTRAINT "sync_conflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
