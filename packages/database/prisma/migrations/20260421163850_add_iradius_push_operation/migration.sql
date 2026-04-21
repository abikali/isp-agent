-- CreateTable
CREATE TABLE "iradius_push_operation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "phase" TEXT,
    "totalCustomers" INTEGER NOT NULL DEFAULT 0,
    "processedCustomers" INTEGER NOT NULL DEFAULT 0,
    "pushedCustomers" INTEGER NOT NULL DEFAULT 0,
    "skippedCustomers" INTEGER NOT NULL DEFAULT 0,
    "failedCustomers" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iradius_push_operation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "iradius_push_operation_organizationId_idx" ON "iradius_push_operation"("organizationId");

-- AddForeignKey
ALTER TABLE "iradius_push_operation" ADD CONSTRAINT "iradius_push_operation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
