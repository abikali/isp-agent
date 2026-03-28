/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,external_billing_id]` on the table `cash_collection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,external_billing_id]` on the table `expense` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,external_billing_id]` on the table `installation` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,external_billing_id]` on the table `task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "StockAction" ADD VALUE 'DELIVER';

-- AlterEnum
ALTER TYPE "task_source" ADD VALUE 'LEGACY';

-- AlterTable
ALTER TABLE "cash_collection" ADD COLUMN     "external_billing_id" INTEGER;

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "worker_id" TEXT;

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "telegram_chat_id" TEXT;

-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "external_billing_id" INTEGER;

-- AlterTable
ALTER TABLE "installation" ADD COLUMN     "external_billing_id" INTEGER;

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "external_billing_id" INTEGER;

-- CreateTable
CREATE TABLE "followup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerUsername" TEXT,
    "mobile" TEXT,
    "groupName" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "status" TEXT,
    "collectorNote" TEXT,
    "external_billing_id" INTEGER,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uninstalled_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" TEXT,
    "taskId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pictureUrl" TEXT,
    "employeeId" TEXT,
    "status" "InstallationStatus" NOT NULL DEFAULT 'PENDING',
    "external_billing_id" INTEGER,
    "uninstalledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uninstalled_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "followup_organizationId_idx" ON "followup"("organizationId");

-- CreateIndex
CREATE INDEX "followup_customerId_idx" ON "followup"("customerId");

-- CreateIndex
CREATE INDEX "followup_isDone_idx" ON "followup"("isDone");

-- CreateIndex
CREATE UNIQUE INDEX "followup_organizationId_external_billing_id_key" ON "followup"("organizationId", "external_billing_id");

-- CreateIndex
CREATE INDEX "uninstalled_item_organizationId_idx" ON "uninstalled_item"("organizationId");

-- CreateIndex
CREATE INDEX "uninstalled_item_taskId_idx" ON "uninstalled_item"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "uninstalled_item_organizationId_external_billing_id_key" ON "uninstalled_item"("organizationId", "external_billing_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_collection_organizationId_external_billing_id_key" ON "cash_collection"("organizationId", "external_billing_id");

-- CreateIndex
CREATE INDEX "customer_worker_id_idx" ON "customer"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_organizationId_external_billing_id_key" ON "expense"("organizationId", "external_billing_id");

-- CreateIndex
CREATE UNIQUE INDEX "installation_organizationId_external_billing_id_key" ON "installation"("organizationId", "external_billing_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_organizationId_external_billing_id_key" ON "task"("organizationId", "external_billing_id");

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup" ADD CONSTRAINT "followup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup" ADD CONSTRAINT "followup_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uninstalled_item" ADD CONSTRAINT "uninstalled_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uninstalled_item" ADD CONSTRAINT "uninstalled_item_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uninstalled_item" ADD CONSTRAINT "uninstalled_item_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
