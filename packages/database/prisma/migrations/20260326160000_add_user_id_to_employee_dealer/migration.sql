-- AlterTable
ALTER TABLE "employee" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "isp_dealer" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employee_userId_key" ON "employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "isp_dealer_userId_key" ON "isp_dealer"("userId");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isp_dealer" ADD CONSTRAINT "isp_dealer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
