-- CreateTable
CREATE TABLE "ResourceItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "url" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceItem_category_orderIndex_idx" ON "ResourceItem"("category", "orderIndex");

-- CreateIndex
CREATE INDEX "ResourceItem_status_idx" ON "ResourceItem"("status");
