-- CreateTable
CREATE TABLE "fiber_lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "area" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "lostReason" TEXT,
    "boxStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "boxCode" TEXT,
    "ogeroApproached" BOOLEAN NOT NULL DEFAULT false,
    "ogeroRequestRef" TEXT,
    "assigneeId" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "conversationId" TEXT,
    "taskId" TEXT,
    "notes" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiber_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiber_lead_activity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "fromStage" TEXT,
    "toStage" TEXT,
    "ref" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiber_lead_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiber_area" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiber_area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiber_lead_organizationId_stage_idx" ON "fiber_lead"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "fiber_lead_organizationId_nextActionAt_idx" ON "fiber_lead"("organizationId", "nextActionAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiber_lead_organizationId_customerId_key" ON "fiber_lead"("organizationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "fiber_lead_organizationId_conversationId_key" ON "fiber_lead"("organizationId", "conversationId");

-- CreateIndex
CREATE INDEX "fiber_lead_activity_leadId_createdAt_idx" ON "fiber_lead_activity"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiber_lead_activity_leadId_ref_key" ON "fiber_lead_activity"("leadId", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "fiber_area_organizationId_area_key" ON "fiber_area"("organizationId", "area");

-- AddForeignKey
ALTER TABLE "fiber_lead" ADD CONSTRAINT "fiber_lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_lead" ADD CONSTRAINT "fiber_lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_lead" ADD CONSTRAINT "fiber_lead_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_lead_activity" ADD CONSTRAINT "fiber_lead_activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "fiber_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_area" ADD CONSTRAINT "fiber_area_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
