-- Step 1: Add the stoppedAccount boolean column
ALTER TABLE "payment" ADD COLUMN "stoppedAccount" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Migrate existing STOPPED records
UPDATE "payment" SET "stoppedAccount" = true WHERE "status" = 'STOPPED';
UPDATE "payment" SET "status" = 'COLLECTED' WHERE "status" = 'STOPPED';

-- Step 3: Drop old enum and recreate without STOPPED
ALTER TABLE "payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payment" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
DROP TYPE "PaymentStatus";
CREATE TYPE "PaymentStatus" AS ENUM ('COLLECTED');
ALTER TABLE "payment" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::"PaymentStatus";
ALTER TABLE "payment" ALTER COLUMN "status" SET DEFAULT 'COLLECTED';

-- Step 4: Replace the status index with stoppedAccount index
DROP INDEX IF EXISTS "payment_status_idx";
CREATE INDEX "payment_stoppedAccount_idx" ON "payment"("stoppedAccount");
