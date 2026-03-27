-- CreateEnum
CREATE TYPE "BillingCycleStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSED', 'PARTIAL', 'STOPPED');

-- CreateEnum
CREATE TYPE "PaymentNoteCategory" AS ENUM ('DOWNGRADE', 'UPGRADE', 'DISCOUNT', 'REFERRAL', 'MOVED', 'POOR_SERVICE', 'CANT_PAY', 'TEMP_STOP');

-- CreateEnum
CREATE TYPE "CashCollectionType" AS ENUM ('HANDOFF', 'EXPENSE_DEDUCTION');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StockAction" AS ENUM ('ADD', 'REMOVE', 'TRANSFER_TO_WORKER', 'TRANSFER_FROM_WORKER', 'ADJUST');

-- AlterEnum
ALTER TYPE "TaskCategory" ADD VALUE 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "paidCurrentCycle" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "followUpStatus" TEXT;

-- CreateTable
CREATE TABLE "billing_cycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "BillingCycleStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "billingCycleId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "accountPrice" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "freeAccount" BOOLEAN NOT NULL DEFAULT false,
    "stoppedAccount" BOOLEAN NOT NULL DEFAULT false,
    "noteCategory" "PaymentNoteCategory",
    "notes" TEXT,
    "receiptSent" BOOLEAN NOT NULL DEFAULT false,
    "receiptSentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_collection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "type" "CashCollectionType" NOT NULL DEFAULT 'HANDOFF',
    "expenseId" TEXT,
    "receivedById" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertThreshold" INTEGER,
    "alertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_stock" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "employeeId" TEXT,
    "performedById" TEXT NOT NULL,
    "action" "StockAction" NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "adminQtyBefore" INTEGER,
    "adminQtyAfter" INTEGER,
    "workerQtyBefore" INTEGER,
    "workerQtyAfter" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "stockItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAddOn" BOOLEAN NOT NULL DEFAULT false,
    "status" "InstallationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_cycle_organizationId_idx" ON "billing_cycle"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_cycle_organizationId_year_month_key" ON "billing_cycle"("organizationId", "year", "month");

-- CreateIndex
CREATE INDEX "payment_organizationId_billingCycleId_idx" ON "payment"("organizationId", "billingCycleId");

-- CreateIndex
CREATE INDEX "payment_customerId_idx" ON "payment"("customerId");

-- CreateIndex
CREATE INDEX "payment_collectorId_idx" ON "payment"("collectorId");

-- CreateIndex
CREATE INDEX "payment_processedById_idx" ON "payment"("processedById");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_collection_expenseId_key" ON "cash_collection"("expenseId");

-- CreateIndex
CREATE INDEX "cash_collection_organizationId_collectorId_idx" ON "cash_collection"("organizationId", "collectorId");

-- CreateIndex
CREATE INDEX "cash_collection_collectedAt_idx" ON "cash_collection"("collectedAt");

-- CreateIndex
CREATE INDEX "expense_organizationId_status_idx" ON "expense"("organizationId", "status");

-- CreateIndex
CREATE INDEX "expense_submittedById_idx" ON "expense"("submittedById");

-- CreateIndex
CREATE INDEX "stock_item_organizationId_idx" ON "stock_item"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_item_organizationId_name_key" ON "stock_item"("organizationId", "name");

-- CreateIndex
CREATE INDEX "worker_stock_stockItemId_idx" ON "worker_stock"("stockItemId");

-- CreateIndex
CREATE INDEX "worker_stock_employeeId_idx" ON "worker_stock"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_stock_stockItemId_employeeId_key" ON "worker_stock"("stockItemId", "employeeId");

-- CreateIndex
CREATE INDEX "stock_log_organizationId_stockItemId_idx" ON "stock_log"("organizationId", "stockItemId");

-- CreateIndex
CREATE INDEX "stock_log_employeeId_idx" ON "stock_log"("employeeId");

-- CreateIndex
CREATE INDEX "installation_organizationId_idx" ON "installation"("organizationId");

-- CreateIndex
CREATE INDEX "installation_customerId_idx" ON "installation"("customerId");

-- CreateIndex
CREATE INDEX "installation_employeeId_idx" ON "installation"("employeeId");

-- AddForeignKey
ALTER TABLE "billing_cycle" ADD CONSTRAINT "billing_cycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_billingCycleId_fkey" FOREIGN KEY ("billingCycleId") REFERENCES "billing_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_collection" ADD CONSTRAINT "cash_collection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_collection" ADD CONSTRAINT "cash_collection_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_collection" ADD CONSTRAINT "cash_collection_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_collection" ADD CONSTRAINT "cash_collection_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_stock" ADD CONSTRAINT "worker_stock_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_stock" ADD CONSTRAINT "worker_stock_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_log" ADD CONSTRAINT "stock_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_log" ADD CONSTRAINT "stock_log_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_log" ADD CONSTRAINT "stock_log_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_log" ADD CONSTRAINT "stock_log_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
