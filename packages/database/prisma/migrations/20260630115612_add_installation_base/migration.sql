-- AlterTable
ALTER TABLE "installation" ADD COLUMN     "baseId" TEXT;

-- CreateIndex
CREATE INDEX "installation_baseId_idx" ON "installation"("baseId");

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "base"("id") ON DELETE SET NULL ON UPDATE CASCADE;
