-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "cycleStartDownloadBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "cycleStartUploadBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "cycleStartedAt" TIMESTAMP(3);
