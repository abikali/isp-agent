-- AlterTable
ALTER TABLE "notification_preference" ADD COLUMN     "monitoringEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "monitoringInApp" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "watcher" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "config" JSONB,
    "intervalSeconds" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatusChange" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedDownAt" TIMESTAMP(3),
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "consecutiveOk" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watcher_execution" (
    "id" TEXT NOT NULL,
    "watcherId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watcher_execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watcher_organizationId_idx" ON "watcher"("organizationId");

-- CreateIndex
CREATE INDEX "watcher_enabled_nextRunAt_idx" ON "watcher"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "watcher_execution_watcherId_createdAt_idx" ON "watcher_execution"("watcherId", "createdAt");

-- AddForeignKey
ALTER TABLE "watcher" ADD CONSTRAINT "watcher_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watcher" ADD CONSTRAINT "watcher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watcher_execution" ADD CONSTRAINT "watcher_execution_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "watcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
