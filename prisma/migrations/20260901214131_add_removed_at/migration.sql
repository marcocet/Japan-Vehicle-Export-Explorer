-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Listing" (
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
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" DATETIME,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Listing" ("bodyType", "color", "description", "driveType", "engineCc", "firstSeenAt", "fuelType", "id", "imageUrl", "isActive", "lastSeenAt", "location", "make", "mileageKm", "mileageRaw", "mileageUnit", "model", "priceCurrency", "priceRaw", "priceUsd", "scrapedAt", "sourceId", "sourceSite", "sourceUrl", "title", "transmission", "year") SELECT "bodyType", "color", "description", "driveType", "engineCc", "firstSeenAt", "fuelType", "id", "imageUrl", "isActive", "lastSeenAt", "location", "make", "mileageKm", "mileageRaw", "mileageUnit", "model", "priceCurrency", "priceRaw", "priceUsd", "scrapedAt", "sourceId", "sourceSite", "sourceUrl", "title", "transmission", "year" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE INDEX "Listing_make_idx" ON "Listing"("make");
CREATE INDEX "Listing_model_idx" ON "Listing"("model");
CREATE INDEX "Listing_year_idx" ON "Listing"("year");
CREATE INDEX "Listing_priceUsd_idx" ON "Listing"("priceUsd");
CREATE INDEX "Listing_mileageKm_idx" ON "Listing"("mileageKm");
CREATE INDEX "Listing_sourceSite_idx" ON "Listing"("sourceSite");
CREATE INDEX "Listing_isActive_idx" ON "Listing"("isActive");
CREATE UNIQUE INDEX "Listing_sourceSite_sourceId_key" ON "Listing"("sourceSite", "sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
