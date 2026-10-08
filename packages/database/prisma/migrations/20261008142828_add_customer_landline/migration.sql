-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "hasLandline" BOOLEAN,
ADD COLUMN     "landline" TEXT,
ADD COLUMN     "landlineCheckedAt" TIMESTAMP(3);
