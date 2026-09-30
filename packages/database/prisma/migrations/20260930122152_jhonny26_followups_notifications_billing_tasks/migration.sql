-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "conversationSummaryIdleMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "conversationSummaryMode" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "outreachRequireApproval" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "postInstallFollowUpDays" INTEGER,
ADD COLUMN     "postStopFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postStopFollowUpTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "post_escalation_check_minutes" INTEGER,
ADD COLUMN     "voiceReplies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceReplyModel" TEXT;

-- AlterTable
ALTER TABLE "ai_conversation" ADD COLUMN     "awaiting_human_since" TIMESTAMP(3),
ADD COLUMN     "summarized_through_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "counts_free_override" BOOLEAN,
ADD COLUMN     "counts_stop_override" BOOLEAN;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "collector_counts_free" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "collector_counts_stop" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiry_reminder_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiry_reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiry_reminder_sms" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expiry_reminder_whatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_worker_on_task_reminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminder_fallback_phone" TEXT,
ADD COLUMN     "task_reminder_lead_minutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "stopNoticeSentAt" TIMESTAMP(3),
ADD COLUMN     "stopNoticeSentById" TEXT;

-- AlterTable
ALTER TABLE "stock_item" ADD COLUMN     "isElectricity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "supplier" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "due_has_time" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contactPhone" TEXT,
    "templateName" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_summary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerId" TEXT,
    "fromAt" TIMESTAMP(3) NOT NULL,
    "toAt" TIMESTAMP(3) NOT NULL,
    "userMessages" INTEGER NOT NULL,
    "botMessages" INTEGER NOT NULL,
    "adminMessages" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "customerMood" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "botActions" TEXT,
    "openItems" TEXT,
    "taskId" TEXT,
    "telegramSentAt" TIMESTAMP(3),
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_follow_up" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" TEXT,
    "reason" TEXT,
    "skipReason" TEXT,
    "customerId" TEXT,
    "conversationId" TEXT,
    "taskId" TEXT,
    "setupRequestId" TEXT,
    "paymentId" TEXT,
    "phone" TEXT,
    "dueAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "templateName" TEXT,
    "messageText" TEXT,
    "externalMessageId" TEXT,
    "aiMessageId" TEXT,
    "reply" TEXT,
    "replyAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_follow_up_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_notification_organizationId_createdAt_idx" ON "customer_notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_notification_customerId_idx" ON "customer_notification"("customerId");

-- CreateIndex
CREATE INDEX "customer_notification_paymentId_idx" ON "customer_notification"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_notification_invoiceId_kind_channel_key" ON "customer_notification"("invoiceId", "kind", "channel");

-- CreateIndex
CREATE INDEX "ai_conversation_summary_organizationId_createdAt_idx" ON "ai_conversation_summary"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversation_summary_conversationId_toAt_idx" ON "ai_conversation_summary"("conversationId", "toAt");

-- CreateIndex
CREATE INDEX "ai_conversation_summary_customerId_createdAt_idx" ON "ai_conversation_summary"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "bot_follow_up_organizationId_status_dueAt_idx" ON "bot_follow_up"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "bot_follow_up_organizationId_type_createdAt_idx" ON "bot_follow_up"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "bot_follow_up_customerId_createdAt_idx" ON "bot_follow_up"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "bot_follow_up_conversationId_status_idx" ON "bot_follow_up"("conversationId", "status");

-- CreateIndex
CREATE INDEX "bot_follow_up_phone_status_idx" ON "bot_follow_up"("phone", "status");

-- CreateIndex
CREATE INDEX "customer_organizationId_mikrotikInterface_idx" ON "customer"("organizationId", "mikrotikInterface");

-- AddForeignKey
ALTER TABLE "customer_notification" ADD CONSTRAINT "customer_notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notification" ADD CONSTRAINT "customer_notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notification" ADD CONSTRAINT "customer_notification_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "customer_invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notification" ADD CONSTRAINT "customer_notification_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_summary" ADD CONSTRAINT "ai_conversation_summary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_summary" ADD CONSTRAINT "ai_conversation_summary_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_follow_up" ADD CONSTRAINT "bot_follow_up_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_follow_up" ADD CONSTRAINT "bot_follow_up_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_follow_up" ADD CONSTRAINT "bot_follow_up_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_follow_up" ADD CONSTRAINT "bot_follow_up_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
