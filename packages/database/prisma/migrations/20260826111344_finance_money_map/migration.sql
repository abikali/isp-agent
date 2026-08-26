-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('REVENUE', 'COST', 'DRAW', 'TRANSFER');

-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "financeCategoryId" TEXT;

-- CreateTable
CREATE TABLE "finance_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "hint" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_rule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "financeCategoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdFromLine" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_charge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "externalUserId" TEXT,
    "description" TEXT,
    "operationDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_category_organizationId_kind_idx" ON "finance_category"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "finance_category_organizationId_label_key" ON "finance_category"("organizationId", "label");

-- CreateIndex
CREATE INDEX "finance_rule_organizationId_priority_idx" ON "finance_rule"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "finance_rule_financeCategoryId_idx" ON "finance_rule"("financeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_charge_externalId_key" ON "dealer_charge"("externalId");

-- CreateIndex
CREATE INDEX "dealer_charge_organizationId_operationDate_idx" ON "dealer_charge"("organizationId", "operationDate");

-- CreateIndex
CREATE INDEX "dealer_charge_dealerId_operationDate_idx" ON "dealer_charge"("dealerId", "operationDate");

-- CreateIndex
CREATE INDEX "dealer_charge_type_idx" ON "dealer_charge"("type");

-- CreateIndex
CREATE INDEX "expense_financeCategoryId_idx" ON "expense"("financeCategoryId");

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_financeCategoryId_fkey" FOREIGN KEY ("financeCategoryId") REFERENCES "finance_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_rule" ADD CONSTRAINT "finance_rule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_rule" ADD CONSTRAINT "finance_rule_financeCategoryId_fkey" FOREIGN KEY ("financeCategoryId") REFERENCES "finance_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_charge" ADD CONSTRAINT "dealer_charge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_charge" ADD CONSTRAINT "dealer_charge_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "isp_dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
