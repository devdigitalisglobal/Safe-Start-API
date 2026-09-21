-- AlterTable
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT;

-- CreateIndex
CREATE INDEX "User_suspendedAt_idx" ON "User"("suspendedAt");
