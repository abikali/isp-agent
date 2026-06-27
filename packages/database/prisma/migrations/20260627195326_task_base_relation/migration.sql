-- AlterTable
ALTER TABLE "task" ADD COLUMN     "baseId" TEXT;

-- CreateIndex
CREATE INDEX "task_baseId_idx" ON "task"("baseId");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "base"("id") ON DELETE SET NULL ON UPDATE CASCADE;
