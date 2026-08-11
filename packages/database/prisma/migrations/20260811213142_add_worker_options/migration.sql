-- CreateTable
CREATE TABLE "worker_option" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_option_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_option_organizationId_listKey_idx" ON "worker_option"("organizationId", "listKey");

-- CreateIndex
CREATE UNIQUE INDEX "worker_option_organizationId_listKey_value_key" ON "worker_option"("organizationId", "listKey", "value");

-- AddForeignKey
ALTER TABLE "worker_option" ADD CONSTRAINT "worker_option_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
