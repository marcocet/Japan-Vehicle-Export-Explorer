import fs from "fs";
import path from "path";
import { prisma } from "../lib/db";
import { parseNumeric } from "../lib/normalize";
import { inferBodyType } from "../lib/bodyType";

type ManualEntry = {
  sourceUrl: string;
  sourceSite?: string; // defaults to "cardealpage"
  title?: string; // defaults to "{year} {make} {model}"
  make: string;
  model: string;
  year: number | string;
  price: number | string; // accepts raw text like "$8,500"
  mileage?: number | string; // accepts raw text like "45,000 km"; defaults to 0
  transmission?: string;
  fuelType?: string;
  driveType?: string;
  engineCc?: number;
  color?: string;
  bodyType?: string;
  location?: string;
  imageUrl?: string;
  description?: string;
};

// Derives a stable id from the listing URL so re-running the import on an edited file
// updates the same row instead of creating duplicates.
function deriveSourceId(url: string): string {
  const clean = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const afterHost = clean.split("/").slice(1).join("-");
  return (afterHost || clean).slice(0, 190);
}

function toNumber(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? value : Math.round(parseNumeric(value));
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run import:manual -- <path-to-json-file>");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  const entries: ManualEntry[] = JSON.parse(raw);

  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const year = toNumber(entry.year);
    const priceUsd = toNumber(entry.price);

    if (!entry.sourceUrl || !entry.make || !entry.model || !year || !priceUsd) {
      console.warn("Skipping entry (missing sourceUrl/make/model/year/price):", entry);
      skipped++;
      continue;
    }

    const sourceSite = entry.sourceSite ?? "cardealpage";
    const sourceId = deriveSourceId(entry.sourceUrl);
    const title = entry.title ?? `${year} ${entry.make} ${entry.model}`;
    const mileageKm = toNumber(entry.mileage) ?? 0;

    const data = {
      sourceUrl: entry.sourceUrl,
      title,
      make: entry.make,
      model: entry.model,
      year,
      priceUsd,
      priceCurrency: "USD",
      mileageKm,
      mileageUnit: "km",
      transmission: entry.transmission,
      fuelType: entry.fuelType,
      driveType: entry.driveType,
      engineCc: entry.engineCc,
      color: entry.color,
      bodyType: entry.bodyType ?? inferBodyType(entry.model, entry.engineCc),
      location: entry.location,
      imageUrl: entry.imageUrl,
      description: entry.description ?? title,
      isActive: true,
      lastSeenAt: new Date(),
      removedAt: null,
    };

    await prisma.listing.upsert({
      where: { sourceSite_sourceId: { sourceSite, sourceId } },
      create: { sourceSite, sourceId, ...data },
      update: data,
    });
    imported++;
  }

  console.log(`Imported/updated ${imported} listing(s), skipped ${skipped}, from ${filePath}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
