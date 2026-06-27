-- CreateEnum
CREATE TYPE "StockRefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "stock_refund_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "StockRefundStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_refund_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_refund_request_organizationId_status_idx" ON "stock_refund_request"("organizationId", "status");

-- CreateIndex
CREATE INDEX "stock_refund_request_employeeId_idx" ON "stock_refund_request"("employeeId");

-- CreateIndex
CREATE INDEX "stock_refund_request_stockItemId_idx" ON "stock_refund_request"("stockItemId");

-- AddForeignKey
ALTER TABLE "stock_refund_request" ADD CONSTRAINT "stock_refund_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_refund_request" ADD CONSTRAINT "stock_refund_request_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_refund_request" ADD CONSTRAINT "stock_refund_request_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_refund_request" ADD CONSTRAINT "stock_refund_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
