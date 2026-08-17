-- CreateTable
CREATE TABLE "PartnerApiCredential" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "label" TEXT,
    "scopes" TEXT NOT NULL DEFAULT 'reports:read',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerApiCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerApiCredential_clientId_key" ON "PartnerApiCredential"("clientId");
CREATE INDEX "PartnerApiCredential_partnerId_idx" ON "PartnerApiCredential"("partnerId");
CREATE INDEX "PartnerApiCredential_status_idx" ON "PartnerApiCredential"("status");

ALTER TABLE "PartnerApiCredential" ADD CONSTRAINT "PartnerApiCredential_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
