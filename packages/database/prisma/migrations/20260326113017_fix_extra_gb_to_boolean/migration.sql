/*
  Warnings:

  - The `extraGb` column on the `isp_dealer` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "isp_dealer" DROP COLUMN "extraGb",
ADD COLUMN     "extraGb" BOOLEAN NOT NULL DEFAULT false;
