import { prisma } from "../lib/db";
import { inferBodyType } from "../lib/bodyType";
import { ScrapeMode, SiteAdapter } from "./types";
import { closeSharedBrowser } from "./utils/playwrightClient";
import { readStatus, writeStatus, ScrapeStatus } from "./statusFile";

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

const mode: ScrapeMode = process.argv.includes("--deep") ? "deep" : "incremental";

function updateStatus(patch: Partial<ScrapeStatus>): ScrapeStatus {
  const current = readStatus() ?? {
    status: "idle",
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentSite: null,
    sites: {},
  };
  const next = { ...current, ...patch };
  writeStatus(next);
  return next;
}

async function runAdapter(adapter: SiteAdapter): Promise<void> {
  console.log(`[${adapter.siteKey}] starting scrape (mode: ${mode})...`);

  const existing = await prisma.listing.findMany({
    where: { sourceSite: adapter.siteKey },
    select: { sourceId: true },
  });
  const knownIds = new Set(existing.map((l) => l.sourceId));

  updateStatus({
    currentSite: adapter.siteKey,
    sites: {
      ...(readStatus()?.sites ?? {}),
      [adapter.siteKey]: { status: "running", listingsSoFar: 0 },
    },
  });

  let listings;
  try {
    listings = await adapter.scrape({
      mode,
      knownIds,
      onProgress: (progress) => {
        updateStatus({
          sites: {
            ...(readStatus()?.sites ?? {}),
            [adapter.siteKey]: { status: "running", currentMake: progress.make, listingsSoFar: progress.listingsSoFar },
          },
        });
      },
    });
  } catch (err) {
    console.error(`[${adapter.siteKey}] scrape failed, leaving existing listings untouched:`, err);
    updateStatus({
      sites: {
        ...(readStatus()?.sites ?? {}),
        [adapter.siteKey]: { status: "error", listingsSoFar: 0, error: err instanceof Error ? err.message : String(err) },
      },
    });
    return;
  }

  if (listings.length === 0) {
    console.warn(`[${adapter.siteKey}] scrape returned 0 listings — treating as a likely glitch, not marking existing listings stale.`);
    updateStatus({
      sites: {
        ...(readStatus()?.sites ?? {}),
        [adapter.siteKey]: { status: "done", listingsSoFar: 0, upserted: 0, stale: 0 },
      },
    });
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

  // Deep-crawl runs only ever cover a bounded slice of a site's full catalog, so a
  // listing not appearing in this run's results says nothing about whether it's still
  // for sale — only the routine incremental run's stale-marking is a meaningful signal.
  let staleCount = 0;
  if (mode === "incremental") {
    const stale = await prisma.listing.updateMany({
      where: {
        sourceSite: adapter.siteKey,
        sourceId: { notIn: Array.from(seenIds) },
        isActive: true,
      },
      data: { isActive: false, removedAt: scrapedAt },
    });
    staleCount = stale.count;
  }

  console.log(`[${adapter.siteKey}] done — upserted ${seenIds.size}, marked ${staleCount} stale.`);
  updateStatus({
    sites: {
      ...(readStatus()?.sites ?? {}),
      [adapter.siteKey]: { status: "done", listingsSoFar: listings.length, upserted: seenIds.size, stale: staleCount },
    },
  });
}

async function main(): Promise<void> {
  updateStatus({
    status: "running",
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentSite: null,
    sites: {},
  });

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
    updateStatus({ status: "idle", currentSite: null, finishedAt: new Date().toISOString() });
  });
