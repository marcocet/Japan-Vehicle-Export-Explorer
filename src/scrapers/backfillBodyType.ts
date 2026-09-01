// One-off backfill: fills in bodyType for existing rows scraped before that field was
// inferred automatically. Safe to re-run; only touches rows where bodyType is still null.
import { prisma } from "../lib/db";
import { inferBodyType } from "../lib/bodyType";

async function main() {
  const listings = await prisma.listing.findMany({
    where: { bodyType: null },
    select: { id: true, model: true, engineCc: true },
  });

  let updated = 0;
  for (const listing of listings) {
    const bodyType = inferBodyType(listing.model, listing.engineCc);
    if (!bodyType) continue;
    await prisma.listing.update({ where: { id: listing.id }, data: { bodyType } });
    updated++;
  }

  console.log(`Backfilled bodyType on ${updated} of ${listings.length} listings missing it.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
