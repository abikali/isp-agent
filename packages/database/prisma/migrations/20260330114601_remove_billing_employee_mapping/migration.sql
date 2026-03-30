/*
  Warnings:

  - You are about to drop the `billing_employee_mapping` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "billing_employee_mapping" DROP CONSTRAINT "billing_employee_mapping_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "billing_employee_mapping" DROP CONSTRAINT "billing_employee_mapping_organizationId_fkey";

-- DropTable
DROP TABLE "billing_employee_mapping";
