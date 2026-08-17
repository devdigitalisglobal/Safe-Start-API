-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "logoAlt" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- Migrate singleton branding into the default partner row
INSERT INTO "Partner" ("id", "slug", "name", "logoUrl", "logoAlt", "isDefault", "status", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    'default',
    COALESCE("partnerName", 'Safe Start'),
    "logoUrl",
    "logoAlt",
    true,
    'active',
    CURRENT_TIMESTAMP,
    COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "PartnerBranding"
WHERE "id" = 'default';

INSERT INTO "Partner" ("id", "slug", "name", "isDefault", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'default', 'Safe Start', true, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Partner" WHERE "isDefault" = true);

ALTER TABLE "School" ADD COLUMN "partnerId" TEXT;

CREATE UNIQUE INDEX "Partner_slug_key" ON "Partner"("slug");
CREATE INDEX "Partner_isDefault_idx" ON "Partner"("isDefault");
CREATE INDEX "School_partnerId_idx" ON "School"("partnerId");

ALTER TABLE "School" ADD CONSTRAINT "School_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "PartnerBranding";
