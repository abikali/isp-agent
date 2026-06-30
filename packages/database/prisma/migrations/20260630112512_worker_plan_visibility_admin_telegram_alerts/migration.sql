/*
  Warnings:

  - A unique constraint covering the columns `[telegram_link_token]` on the table `employee` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "telegram_link_token" TEXT;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "admin_telegram_chat_id" TEXT,
ADD COLUMN     "alert_on_installation_done" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alert_on_payment_collected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alert_on_worker_request" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "service_plan_worker" (
    "id" TEXT NOT NULL,
    "servicePlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "service_plan_worker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_plan_worker_employeeId_idx" ON "service_plan_worker"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "service_plan_worker_servicePlanId_employeeId_key" ON "service_plan_worker"("servicePlanId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_telegram_link_token_key" ON "employee"("telegram_link_token");

-- AddForeignKey
ALTER TABLE "service_plan_worker" ADD CONSTRAINT "service_plan_worker_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "service_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_plan_worker" ADD CONSTRAINT "service_plan_worker_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
