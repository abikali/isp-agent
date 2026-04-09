-- CreateTable
CREATE TABLE "location_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "location_request_token_key" ON "location_request"("token");

-- CreateIndex
CREATE INDEX "location_request_organizationId_customerId_idx" ON "location_request"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "location_request_customerId_idx" ON "location_request"("customerId");

-- AddForeignKey
ALTER TABLE "location_request" ADD CONSTRAINT "location_request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
