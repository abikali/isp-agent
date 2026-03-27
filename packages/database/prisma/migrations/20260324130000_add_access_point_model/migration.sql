-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "accessPointId" TEXT;

-- AlterTable
ALTER TABLE "station" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "access_point" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stationId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "signal" TEXT,
    "boardName" TEXT,
    "version" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_point_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_point_organizationId_idx" ON "access_point"("organizationId");

-- CreateIndex
CREATE INDEX "access_point_stationId_idx" ON "access_point"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "access_point_organizationId_externalId_key" ON "access_point"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "customer_accessPointId_idx" ON "customer"("accessPointId");

-- CreateIndex
CREATE UNIQUE INDEX "station_organizationId_externalId_key" ON "station"("organizationId", "externalId");

-- AddForeignKey
ALTER TABLE "access_point" ADD CONSTRAINT "access_point_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_point" ADD CONSTRAINT "access_point_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "access_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
