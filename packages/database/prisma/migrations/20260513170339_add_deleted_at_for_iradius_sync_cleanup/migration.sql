-- AlterTable
ALTER TABLE "access_point" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "iradius_sync_operation" ADD COLUMN     "removedRecords" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "restoredRecords" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "isp_dealer" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "isp_nas" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "isp_router" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_plan" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "station" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "access_point_organizationId_deletedAt_idx" ON "access_point"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "customer_organizationId_deletedAt_idx" ON "customer"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "employee_organizationId_deletedAt_idx" ON "employee"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "isp_dealer_deletedAt_idx" ON "isp_dealer"("deletedAt");

-- CreateIndex
CREATE INDEX "isp_nas_organizationId_deletedAt_idx" ON "isp_nas"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "isp_router_organizationId_deletedAt_idx" ON "isp_router"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "service_plan_organizationId_deletedAt_idx" ON "service_plan"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "station_organizationId_deletedAt_idx" ON "station"("organizationId", "deletedAt");
