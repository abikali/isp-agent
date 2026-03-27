-- AlterTable
ALTER TABLE "access_point" ADD COLUMN     "interface" TEXT,
ADD COLUMN     "isUbiquiti" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "uptime" TEXT;

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "categoryName" TEXT,
ADD COLUMN     "collectorName" TEXT,
ADD COLUMN     "collectorPhone" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "downloadBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mikrotikInterface" TEXT,
ADD COLUMN     "mikrotikUser" TEXT,
ADD COLUMN     "nasHost" TEXT,
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staticIp" TEXT,
ADD COLUMN     "uploadBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customer_transaction" ADD COLUMN     "invoiceExternalId" TEXT;

-- AlterTable
ALTER TABLE "service_plan" ADD COLUMN     "dailyQuotaDown" INTEGER,
ADD COLUMN     "dailyQuotaUp" INTEGER,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "ipPoolName" TEXT,
ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "monthlyQuota" INTEGER,
ADD COLUMN     "validityPeriod" INTEGER,
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "station" ADD COLUMN     "apiPort" INTEGER,
ADD COLUMN     "host" TEXT,
ADD COLUMN     "sshPort" INTEGER,
ADD COLUMN     "uptime" TEXT,
ADD COLUMN     "version" TEXT,
ADD COLUMN     "vlanId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "service_plan_organizationId_externalId_key" ON "service_plan"("organizationId", "externalId");
