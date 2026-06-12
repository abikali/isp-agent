-- CreateEnum
CREATE TYPE "SetupRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "InstallationStatus" ADD VALUE 'DENIED';

-- AlterEnum
ALTER TYPE "TaskCategory" ADD VALUE 'UNINSTALL';

-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "installation" ADD COLUMN     "setupRequestId" TEXT,
ADD COLUMN     "stationId" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "completedByEmployeeId" TEXT,
ADD COLUMN     "completionPhotoUrl" TEXT,
ADD COLUMN     "resolutionCode" TEXT,
ADD COLUMN     "resolutionNote" TEXT;

-- AlterTable
ALTER TABLE "uninstalled_item" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "stockItemId" TEXT;

-- CreateTable
CREATE TABLE "customer_setup_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "durationType" TEXT NOT NULL,
    "durationDays" INTEGER,
    "firstChargeAmount" DOUBLE PRECISION NOT NULL,
    "status" "SetupRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_setup_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_setup_request_customerId_key" ON "customer_setup_request"("customerId");

-- CreateIndex
CREATE INDEX "customer_setup_request_organizationId_status_idx" ON "customer_setup_request"("organizationId", "status");

-- CreateIndex
CREATE INDEX "customer_setup_request_requestedById_idx" ON "customer_setup_request"("requestedById");

-- CreateIndex
CREATE INDEX "installation_organizationId_status_idx" ON "installation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "installation_stationId_idx" ON "installation"("stationId");

-- CreateIndex
CREATE INDEX "installation_setupRequestId_idx" ON "installation"("setupRequestId");

-- CreateIndex
CREATE INDEX "uninstalled_item_organizationId_status_idx" ON "uninstalled_item"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_completedByEmployeeId_fkey" FOREIGN KEY ("completedByEmployeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_setupRequestId_fkey" FOREIGN KEY ("setupRequestId") REFERENCES "customer_setup_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_setup_request" ADD CONSTRAINT "customer_setup_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_setup_request" ADD CONSTRAINT "customer_setup_request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_setup_request" ADD CONSTRAINT "customer_setup_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_setup_request" ADD CONSTRAINT "customer_setup_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uninstalled_item" ADD CONSTRAINT "uninstalled_item_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uninstalled_item" ADD CONSTRAINT "uninstalled_item_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
