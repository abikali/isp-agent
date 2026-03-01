-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "maintenanceMessage" TEXT,
ADD COLUMN     "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;
