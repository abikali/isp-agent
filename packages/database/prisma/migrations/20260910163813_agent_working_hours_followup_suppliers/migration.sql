-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "followUpMessage" TEXT,
ADD COLUMN     "followUpMinutes" INTEGER,
ADD COLUMN     "offDutyMessage" TEXT,
ADD COLUMN     "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
ADD COLUMN     "workingHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workingHoursEnd" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "workingHoursStart" TEXT NOT NULL DEFAULT '09:00';

-- AlterTable
ALTER TABLE "ai_conversation" ADD COLUMN     "follow_up_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_log" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phones" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_item_supplier" (
    "stockItemId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_item_supplier_pkey" PRIMARY KEY ("stockItemId","supplierId")
);

-- CreateIndex
CREATE INDEX "supplier_organizationId_idx" ON "supplier"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_organizationId_name_key" ON "supplier"("organizationId", "name");

-- CreateIndex
CREATE INDEX "stock_item_supplier_supplierId_idx" ON "stock_item_supplier"("supplierId");

-- CreateIndex
CREATE INDEX "stock_log_supplierId_idx" ON "stock_log"("supplierId");

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_item_supplier" ADD CONSTRAINT "stock_item_supplier_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_item_supplier" ADD CONSTRAINT "stock_item_supplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_log" ADD CONSTRAINT "stock_log_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
