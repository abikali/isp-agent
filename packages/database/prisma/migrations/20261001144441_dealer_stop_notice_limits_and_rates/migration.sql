-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "expiry_reminder_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "stop_notice_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "stop_notice_sms_limit" INTEGER,
ADD COLUMN     "stop_notice_whatsapp_limit" INTEGER;
