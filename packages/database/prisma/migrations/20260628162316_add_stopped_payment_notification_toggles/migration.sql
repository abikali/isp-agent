-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "stoppedPaymentNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stoppedPaymentTaskEnabled" BOOLEAN NOT NULL DEFAULT true;
