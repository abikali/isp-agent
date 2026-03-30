/*
  Warnings:

  - The `noteCategory` column on the `payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "payment" DROP COLUMN "noteCategory",
ADD COLUMN     "noteCategory" TEXT;

-- DropEnum
DROP TYPE "PaymentNoteCategory";

-- CreateTable
CREATE TABLE "note_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_category_organizationId_idx" ON "note_category"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "note_category_organizationId_value_key" ON "note_category"("organizationId", "value");

-- AddForeignKey
ALTER TABLE "note_category" ADD CONSTRAINT "note_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
