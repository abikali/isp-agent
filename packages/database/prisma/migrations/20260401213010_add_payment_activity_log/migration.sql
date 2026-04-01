-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "activityLog" JSONB NOT NULL DEFAULT '[]';
