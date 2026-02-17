-- AlterTable
ALTER TABLE "ai_conversation" ADD COLUMN     "pinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "verifiedCustomerId" TEXT;

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "pinHash" TEXT;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_verifiedCustomerId_fkey" FOREIGN KEY ("verifiedCustomerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
