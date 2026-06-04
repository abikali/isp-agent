-- CreateTable
CREATE TABLE "ai_maintenance_window" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_maintenance_window_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_maintenance_window_agentId_startsAt_endsAt_idx" ON "ai_maintenance_window"("agentId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "ai_maintenance_window" ADD CONSTRAINT "ai_maintenance_window_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
