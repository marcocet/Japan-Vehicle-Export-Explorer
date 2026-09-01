-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSite" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "priceUsd" INTEGER NOT NULL,
    "priceRaw" TEXT,
    "priceCurrency" TEXT,
    "mileageKm" INTEGER NOT NULL,
    "mileageRaw" TEXT,
    "mileageUnit" TEXT,
    "transmission" TEXT,
    "fuelType" TEXT,
    "driveType" TEXT,
    "engineCc" INTEGER,
    "color" TEXT,
    "bodyType" TEXT,
    "location" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Listing_make_idx" ON "Listing"("make");

-- CreateIndex
CREATE INDEX "Listing_model_idx" ON "Listing"("model");

-- CreateIndex
CREATE INDEX "Listing_year_idx" ON "Listing"("year");

-- CreateIndex
CREATE INDEX "Listing_priceUsd_idx" ON "Listing"("priceUsd");

-- CreateIndex
CREATE INDEX "Listing_mileageKm_idx" ON "Listing"("mileageKm");

-- CreateIndex
CREATE INDEX "Listing_sourceSite_idx" ON "Listing"("sourceSite");

-- CreateIndex
CREATE INDEX "Listing_isActive_idx" ON "Listing"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sourceSite_sourceId_key" ON "Listing"("sourceSite", "sourceId");
