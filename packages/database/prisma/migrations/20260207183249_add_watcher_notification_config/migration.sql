-- AlterTable
ALTER TABLE "watcher" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "notificationConfig" JSONB;
