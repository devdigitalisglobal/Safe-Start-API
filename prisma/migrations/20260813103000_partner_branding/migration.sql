-- CreateTable
CREATE TABLE "PartnerBranding" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "partnerName" TEXT,
    "logoUrl" TEXT,
    "logoAlt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerBranding_pkey" PRIMARY KEY ("id")
);

-- Seed default row
INSERT INTO "PartnerBranding" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
