-- CreateTable
CREATE TABLE "salti_integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiEndpoint" TEXT NOT NULL DEFAULT 'https://saltimarketing.com/',
    "encryptedApiToken" TEXT NOT NULL,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salti_integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_broadcast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateLang" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "audienceType" TEXT NOT NULL,
    "audienceConfig" JSONB NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_broadcast_recipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "contactName" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "saltiMessageId" TEXT,
    "waMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_broadcast_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salti_integration_organizationId_key" ON "salti_integration"("organizationId");

-- CreateIndex
CREATE INDEX "marketing_broadcast_organizationId_createdAt_idx" ON "marketing_broadcast"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_broadcast_recipient_broadcastId_status_idx" ON "marketing_broadcast_recipient"("broadcastId", "status");

-- CreateIndex
CREATE INDEX "marketing_broadcast_recipient_customerId_idx" ON "marketing_broadcast_recipient"("customerId");

-- AddForeignKey
ALTER TABLE "salti_integration" ADD CONSTRAINT "salti_integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_broadcast" ADD CONSTRAINT "marketing_broadcast_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_broadcast_recipient" ADD CONSTRAINT "marketing_broadcast_recipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "marketing_broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_broadcast_recipient" ADD CONSTRAINT "marketing_broadcast_recipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
