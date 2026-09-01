import { prisma } from "../lib/db";
import { inferBodyType } from "../lib/bodyType";
import { SiteAdapter } from "./types";
import { closeSharedBrowser } from "./utils/playwrightClient";

import { sbtJapanAdapter } from "./sites/sbtJapan";
import { carJunctionAdapter } from "./sites/carJunction";
import { carFromJapanAdapter } from "./sites/carFromJapan";
import { cardealpageAdapter } from "./sites/cardealpage";
import { beforwardAdapter } from "./sites/beforward";
import { ibcJapanAdapter } from "./sites/ibcJapan";

const ADAPTERS: SiteAdapter[] = [
  sbtJapanAdapter,
  carJunctionAdapter,
  carFromJapanAdapter,
  cardealpageAdapter,
  beforwardAdapter,
  ibcJapanAdapter,
];

async function runAdapter(adapter: SiteAdapter): Promise<void> {
  console.log(`[${adapter.siteKey}] starting scrape...`);

  let listings;
  try {
    listings = await adapter.scrape();
  } catch (err) {
    console.error(`[${adapter.siteKey}] scrape failed, leaving existing listings untouched:`, err);
    return;
  }

  if (listings.length === 0) {
    console.warn(`[${adapter.siteKey}] scrape returned 0 listings — treating as a likely glitch, not marking existing listings stale.`);
    return;
  }

  console.log(`[${adapter.siteKey}] scraped ${listings.length} listings, upserting...`);

  const seenIds = new Set<string>();
  const scrapedAt = new Date();
  for (const listing of listings) {
    seenIds.add(listing.sourceId);
    // Sites don't reliably expose a body type per listing, so infer one when missing.
    const bodyType = listing.bodyType ?? inferBodyType(listing.model, listing.engineCc);
    try {
      await prisma.listing.upsert({
        where: { sourceSite_sourceId: { sourceSite: adapter.siteKey, sourceId: listing.sourceId } },
        create: { sourceSite: adapter.siteKey, isActive: true, scrapedAt, lastSeenAt: scrapedAt, ...listing, bodyType },
        // removedAt is cleared here in case a previously-removed listing has reappeared.
        update: { isActive: true, scrapedAt, lastSeenAt: scrapedAt, removedAt: null, ...listing, bodyType },
      });
    } catch (err) {
      console.error(`[${adapter.siteKey}] failed to upsert listing ${listing.sourceId}:`, err);
    }
  }

  const stale = await prisma.listing.updateMany({
    where: {
      sourceSite: adapter.siteKey,
      sourceId: { notIn: Array.from(seenIds) },
      isActive: true,
    },
    data: { isActive: false, removedAt: scrapedAt },
  });

  console.log(`[${adapter.siteKey}] done — upserted ${seenIds.size}, marked ${stale.count} stale.`);
}

async function main(): Promise<void> {
  for (const adapter of ADAPTERS) {
    await runAdapter(adapter);
  }
}

main()
  .catch((err) => {
    console.error("Scrape run failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSharedBrowser();
  });
