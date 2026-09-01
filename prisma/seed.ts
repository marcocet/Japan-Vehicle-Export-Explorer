import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const SOURCE_SITES = [
  "sbt_japan",
  "car_junction",
  "car_from_japan",
  "cardealpage",
  "beforward",
  "ibc_japan",
] as const;

const SITE_URLS: Record<(typeof SOURCE_SITES)[number], string> = {
  sbt_japan: "https://www.sbtjapan.com/listing",
  car_junction: "https://www.carjunction.com/listing",
  car_from_japan: "https://www.carfromjapan.com/listing",
  cardealpage: "https://www.cardealpage.com/listing",
  beforward: "https://www.beforward.jp/listing",
  ibc_japan: "https://www.ibcjapan.co.jp/listing",
};

type Template = {
  make: string;
  model: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  engineCc: number;
  colors: string[];
  basePriceUsd: number;
};

const TEMPLATES: Template[] = [
  { make: "Toyota", model: "Land Cruiser", bodyType: "SUV", fuelType: "Diesel", transmission: "Automatic", driveType: "4WD", engineCc: 4200, colors: ["White", "Black", "Silver"], basePriceUsd: 18000 },
  { make: "Toyota", model: "Hiace", bodyType: "Van", fuelType: "Diesel", transmission: "Manual", driveType: "4WD", engineCc: 3000, colors: ["White"], basePriceUsd: 9500 },
  { make: "Toyota", model: "Chaser", bodyType: "Sedan", fuelType: "Petrol", transmission: "Automatic", driveType: "RWD", engineCc: 2500, colors: ["Black", "Silver"], basePriceUsd: 7500 },
  { make: "Toyota", model: "Corolla", bodyType: "Sedan", fuelType: "Petrol", transmission: "Automatic", driveType: "FWD", engineCc: 1500, colors: ["White", "Blue", "Red"], basePriceUsd: 4500 },
  { make: "Nissan", model: "Skyline GT-R", bodyType: "Coupe", fuelType: "Petrol", transmission: "Manual", driveType: "AWD", engineCc: 2600, colors: ["Blue", "White"], basePriceUsd: 42000 },
  { make: "Nissan", model: "Silvia", bodyType: "Coupe", fuelType: "Petrol", transmission: "Manual", driveType: "RWD", engineCc: 2000, colors: ["Black", "Yellow"], basePriceUsd: 12000 },
  { make: "Nissan", model: "Elgrand", bodyType: "Van", fuelType: "Petrol", transmission: "Automatic", driveType: "4WD", engineCc: 3500, colors: ["Black", "Silver"], basePriceUsd: 8000 },
  { make: "Honda", model: "Civic Type R", bodyType: "Hatchback", fuelType: "Petrol", transmission: "Manual", driveType: "FWD", engineCc: 2000, colors: ["White", "Red"], basePriceUsd: 22000 },
  { make: "Honda", model: "S2000", bodyType: "Convertible", fuelType: "Petrol", transmission: "Manual", driveType: "RWD", engineCc: 2000, colors: ["Yellow", "Red"], basePriceUsd: 19000 },
  { make: "Honda", model: "Fit", bodyType: "Hatchback", fuelType: "Hybrid", transmission: "Automatic", driveType: "FWD", engineCc: 1300, colors: ["White", "Silver", "Blue"], basePriceUsd: 5500 },
  { make: "Mazda", model: "RX-7", bodyType: "Coupe", fuelType: "Petrol", transmission: "Manual", driveType: "RWD", engineCc: 1300, colors: ["Red", "White"], basePriceUsd: 24000 },
  { make: "Mazda", model: "Roadster (MX-5)", bodyType: "Convertible", fuelType: "Petrol", transmission: "Manual", driveType: "RWD", engineCc: 1600, colors: ["Red", "Blue"], basePriceUsd: 8500 },
  { make: "Mazda", model: "Demio", bodyType: "Hatchback", fuelType: "Petrol", transmission: "Automatic", driveType: "FWD", engineCc: 1300, colors: ["Silver", "White"], basePriceUsd: 4200 },
  { make: "Subaru", model: "Impreza WRX STI", bodyType: "Sedan", fuelType: "Petrol", transmission: "Manual", driveType: "AWD", engineCc: 2000, colors: ["Blue", "Silver"], basePriceUsd: 16000 },
  { make: "Subaru", model: "Forester", bodyType: "SUV", fuelType: "Petrol", transmission: "Automatic", driveType: "AWD", engineCc: 2000, colors: ["Green", "White"], basePriceUsd: 6500 },
  { make: "Mitsubishi", model: "Lancer Evolution", bodyType: "Sedan", fuelType: "Petrol", transmission: "Manual", driveType: "AWD", engineCc: 2000, colors: ["White", "Blue"], basePriceUsd: 21000 },
  { make: "Mitsubishi", model: "Pajero", bodyType: "SUV", fuelType: "Diesel", transmission: "Automatic", driveType: "4WD", engineCc: 3200, colors: ["Black", "White"], basePriceUsd: 9000 },
  { make: "Suzuki", model: "Jimny", bodyType: "SUV", fuelType: "Petrol", transmission: "Manual", driveType: "4WD", engineCc: 660, colors: ["Green", "White", "Black"], basePriceUsd: 7000 },
  { make: "Suzuki", model: "Swift", bodyType: "Hatchback", fuelType: "Petrol", transmission: "Automatic", driveType: "FWD", engineCc: 1200, colors: ["Red", "White"], basePriceUsd: 4000 },
  { make: "Lexus", model: "IS300", bodyType: "Sedan", fuelType: "Petrol", transmission: "Automatic", driveType: "RWD", engineCc: 3000, colors: ["Black", "Silver"], basePriceUsd: 11000 },
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

async function main() {
  const rand = seededRandom(42);
  const rows: Parameters<typeof prisma.listing.create>[0]["data"][] = [];

  let counter = 0;
  for (const site of SOURCE_SITES) {
    for (const template of TEMPLATES) {
      // Not every site carries every model — skip some combos for realism.
      if (rand() < 0.35) continue;

      counter++;
      const year = 1995 + Math.floor(rand() * 29); // 1995-2023
      const mileageKm = 20000 + Math.floor(rand() * 150000);
      const priceVariance = 0.8 + rand() * 0.5;
      const priceUsd = Math.round(template.basePriceUsd * priceVariance);
      const color = pick(template.colors, rand);
      const sourceId = `${template.make}-${template.model}-${counter}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      rows.push({
        sourceSite: site,
        sourceId,
        sourceUrl: `${SITE_URLS[site]}/${sourceId}`,
        title: `${year} ${template.make} ${template.model}`,
        make: template.make,
        model: template.model,
        year,
        priceUsd,
        priceRaw: `$${priceUsd.toLocaleString()}`,
        priceCurrency: "USD",
        mileageKm,
        mileageRaw: `${mileageKm.toLocaleString()} km`,
        mileageUnit: "km",
        transmission: template.transmission,
        fuelType: template.fuelType,
        driveType: template.driveType,
        engineCc: template.engineCc,
        color,
        bodyType: template.bodyType,
        location: "Japan",
        imageUrl: `https://placehold.co/640x480?text=${encodeURIComponent(`${template.make} ${template.model}`)}`,
        description: `${year} ${template.make} ${template.model} in ${color}, ${template.transmission} ${template.fuelType}, exported from Japan.`,
        isActive: true,
      });
    }
  }

  console.log(`Seeding ${rows.length} listings...`);

  for (const data of rows) {
    await prisma.listing.upsert({
      where: { sourceSite_sourceId: { sourceSite: data.sourceSite, sourceId: data.sourceId } },
      update: data,
      create: data,
    });
  }

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
