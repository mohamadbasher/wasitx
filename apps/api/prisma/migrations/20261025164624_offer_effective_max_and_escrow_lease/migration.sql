/*
  Warnings:

  - Added the required column `effectiveMaxAgorot` to the `Offer` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "EscrowOperation_status_createdAt_idx";

-- AlterTable
ALTER TABLE "EscrowOperation" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "effectiveMaxAgorot" BIGINT NOT NULL;

-- CreateIndex
CREATE INDEX "EscrowOperation_status_nextAttemptAt_idx" ON "EscrowOperation"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Offer_side_status_effectiveMaxAgorot_idx" ON "Offer"("side", "status", "effectiveMaxAgorot");
