-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN "servicePlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
