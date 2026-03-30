/*
  Warnings:

  - The values [PENDING,PROCESSED,PARTIAL] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `closedAt` on the `billing_cycle` table. All the data in the column will be lost.
  - You are about to drop the column `openedAt` on the `billing_cycle` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `billing_cycle` table. All the data in the column will be lost.
  - You are about to drop the column `paidCurrentCycle` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `activeBillingMonth` on the `organization` table. All the data in the column will be lost.
  - You are about to drop the column `activeBillingYear` on the `organization` table. All the data in the column will be lost.
  - You are about to drop the column `processedAt` on the `payment` table. All the data in the column will be lost.
  - You are about to drop the column `processedById` on the `payment` table. All the data in the column will be lost.
  - You are about to drop the column `stoppedAccount` on the `payment` table. All the data in the column will be lost.

*/

-- Step 1: Convert status column to text so we can transform values freely
ALTER TABLE "payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payment" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- Step 2: Migrate payment statuses
-- Use stoppedAccount flag as the source of truth for STOPPED before we drop that column
UPDATE "payment" SET "status" = 'STOPPED' WHERE "stoppedAccount" = true;
UPDATE "payment" SET "status" = 'COLLECTED' WHERE "status" IN ('PENDING', 'PROCESSED', 'PARTIAL');

-- Step 3: Drop old enum and create new one
DROP TYPE "PaymentStatus";
CREATE TYPE "PaymentStatus" AS ENUM ('COLLECTED', 'STOPPED');

-- Step 4: Convert status column back to enum
ALTER TABLE "payment" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::"PaymentStatus";
ALTER TABLE "payment" ALTER COLUMN "status" SET DEFAULT 'COLLECTED';

-- DropForeignKey
ALTER TABLE "payment" DROP CONSTRAINT "payment_processedById_fkey";

-- DropIndex
DROP INDEX "payment_processedById_idx";

-- AlterTable
ALTER TABLE "billing_cycle" DROP COLUMN "closedAt",
DROP COLUMN "openedAt",
DROP COLUMN "status",
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customer" DROP COLUMN "paidCurrentCycle";

-- AlterTable
ALTER TABLE "organization" DROP COLUMN "activeBillingMonth",
DROP COLUMN "activeBillingYear";

-- AlterTable
ALTER TABLE "payment" DROP COLUMN "processedAt",
DROP COLUMN "processedById",
DROP COLUMN "stoppedAccount";

-- DropEnum
DROP TYPE IF EXISTS "BillingCycleStatus";
