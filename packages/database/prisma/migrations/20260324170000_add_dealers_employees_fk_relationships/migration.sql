-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "collectorId" TEXT,
ADD COLUMN     "dealerId" TEXT,
ADD COLUMN     "nasId" TEXT,
ADD COLUMN     "originalCreatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customer_transaction" ADD COLUMN     "collectorId" TEXT;

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "dealerId" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "iRadiusProfile" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "iradius_sync_operation" ADD COLUMN     "processedDealerAccounts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processedDealers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processedEmployees" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalDealerAccounts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalDealers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalEmployees" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "service_plan" ADD COLUMN     "dealerId" TEXT;

-- CreateTable
CREATE TABLE "isp_dealer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyMobile" TEXT,
    "companyVatNumber" TEXT,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "smsSenderId" TEXT,
    "notificationAmount" DOUBLE PRECISION,
    "fupResetPrice" DOUBLE PRECISION,
    "extraOneGbPrice" DOUBLE PRECISION,
    "extraOneGbCommission" DOUBLE PRECISION,
    "canShowRate" BOOLEAN NOT NULL DEFAULT false,
    "canShowSpeed" BOOLEAN NOT NULL DEFAULT false,
    "noCharge" BOOLEAN NOT NULL DEFAULT false,
    "canSendMail" BOOLEAN NOT NULL DEFAULT false,
    "canSendSms" BOOLEAN NOT NULL DEFAULT false,
    "canExportToExcel" BOOLEAN NOT NULL DEFAULT false,
    "canAddDealer" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteUser" BOOLEAN NOT NULL DEFAULT false,
    "canChangeAccountType" BOOLEAN NOT NULL DEFAULT false,
    "parentDealerId" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "isp_dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "isp_dealer_account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "externalId" TEXT,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comment" TEXT,
    "operationDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "isp_dealer_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "isp_dealer_organizationId_idx" ON "isp_dealer"("organizationId");

-- CreateIndex
CREATE INDEX "isp_dealer_parentDealerId_idx" ON "isp_dealer"("parentDealerId");

-- CreateIndex
CREATE UNIQUE INDEX "isp_dealer_organizationId_externalId_key" ON "isp_dealer"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "isp_dealer_account_dealerId_idx" ON "isp_dealer_account"("dealerId");

-- CreateIndex
CREATE INDEX "isp_dealer_account_organizationId_idx" ON "isp_dealer_account"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "isp_dealer_account_organizationId_externalId_key" ON "isp_dealer_account"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "customer_dealerId_idx" ON "customer"("dealerId");

-- CreateIndex
CREATE INDEX "customer_collectorId_idx" ON "customer"("collectorId");

-- CreateIndex
CREATE INDEX "customer_nasId_idx" ON "customer"("nasId");

-- CreateIndex
CREATE INDEX "customer_transaction_collectorId_idx" ON "customer_transaction"("collectorId");

-- CreateIndex
CREATE INDEX "employee_dealerId_idx" ON "employee"("dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_organizationId_externalId_key" ON "employee"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "service_plan_dealerId_idx" ON "service_plan"("dealerId");

-- AddForeignKey
ALTER TABLE "service_plan" ADD CONSTRAINT "service_plan_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "isp_dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "isp_dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_nasId_fkey" FOREIGN KEY ("nasId") REFERENCES "isp_nas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_transaction" ADD CONSTRAINT "customer_transaction_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_dealer" ADD CONSTRAINT "isp_dealer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_dealer" ADD CONSTRAINT "isp_dealer_parentDealerId_fkey" FOREIGN KEY ("parentDealerId") REFERENCES "isp_dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_dealer_account" ADD CONSTRAINT "isp_dealer_account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_dealer_account" ADD CONSTRAINT "isp_dealer_account_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "isp_dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "isp_dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
