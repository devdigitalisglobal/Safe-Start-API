-- Link portal partner users to a Partner row for scoping and provisioning.
ALTER TABLE "User" ADD COLUMN "partnerId" TEXT;

CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
