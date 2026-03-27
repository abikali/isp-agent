-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "automaticRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyDownloadBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "dailyUploadBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "fupMode" TEXT,
ADD COLUMN     "iptvPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "realIpPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customer_transaction" ADD COLUMN     "collectorExternalId" TEXT;

-- AlterTable
ALTER TABLE "service_plan" ADD COLUMN     "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dealerExternalId" TEXT,
ADD COLUMN     "parentCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "station" ADD COLUMN     "apPassword" TEXT,
ADD COLUMN     "apUsername" TEXT,
ADD COLUMN     "sshPassword" TEXT,
ADD COLUMN     "sshUsername" TEXT;

-- CreateTable
CREATE TABLE "isp_nas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "host" TEXT,
    "sharedSecret" TEXT,
    "apiPort" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "isp_nas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "isp_router" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "stationId" TEXT,
    "accessPointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "isp_router_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iradius_sync_operation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "phase" TEXT,
    "totalPlans" INTEGER NOT NULL DEFAULT 0,
    "processedPlans" INTEGER NOT NULL DEFAULT 0,
    "totalStations" INTEGER NOT NULL DEFAULT 0,
    "processedStations" INTEGER NOT NULL DEFAULT 0,
    "totalAccessPoints" INTEGER NOT NULL DEFAULT 0,
    "processedAccessPoints" INTEGER NOT NULL DEFAULT 0,
    "totalNas" INTEGER NOT NULL DEFAULT 0,
    "processedNas" INTEGER NOT NULL DEFAULT 0,
    "totalRouters" INTEGER NOT NULL DEFAULT 0,
    "processedRouters" INTEGER NOT NULL DEFAULT 0,
    "totalCustomers" INTEGER NOT NULL DEFAULT 0,
    "processedCustomers" INTEGER NOT NULL DEFAULT 0,
    "totalTransactions" INTEGER NOT NULL DEFAULT 0,
    "processedTransactions" INTEGER NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "processedInvoices" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iradius_sync_operation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "isp_nas_organizationId_idx" ON "isp_nas"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "isp_nas_organizationId_externalId_key" ON "isp_nas"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "isp_router_organizationId_idx" ON "isp_router"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "isp_router_organizationId_externalId_key" ON "isp_router"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "iradius_sync_operation_organizationId_idx" ON "iradius_sync_operation"("organizationId");

-- AddForeignKey
ALTER TABLE "isp_nas" ADD CONSTRAINT "isp_nas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_router" ADD CONSTRAINT "isp_router_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_router" ADD CONSTRAINT "isp_router_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_router" ADD CONSTRAINT "isp_router_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "access_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iradius_sync_operation" ADD CONSTRAINT "iradius_sync_operation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

