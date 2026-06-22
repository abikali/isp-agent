-- AlterEnum
ALTER TYPE "TaskCategory" ADD VALUE 'REPLACEMENT';

-- AlterTable
ALTER TABLE "installation" ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "installation_taskId_idx" ON "installation"("taskId");

-- AddForeignKey
ALTER TABLE "installation" ADD CONSTRAINT "installation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
