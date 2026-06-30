-- AlterTable
ALTER TABLE "task" ADD COLUMN     "requested_addons" TEXT[] DEFAULT ARRAY[]::TEXT[];
