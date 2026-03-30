/*
  Warnings:

  - The `scanStatus` column on the `access_point` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `scanStatus` column on the `station` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "access_point" DROP COLUMN "scanStatus",
ADD COLUMN     "scanStatus" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "station" DROP COLUMN "scanStatus",
ADD COLUMN     "scanStatus" BOOLEAN NOT NULL DEFAULT false;
