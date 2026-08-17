ALTER TABLE "User" ADD COLUMN "partnerMemberRef" TEXT;
ALTER TABLE "User" ADD COLUMN "partnerConsentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "partnerConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "partnerConsentGranted" BOOLEAN;

CREATE INDEX "User_partnerConsentAt_idx" ON "User"("partnerConsentAt");
