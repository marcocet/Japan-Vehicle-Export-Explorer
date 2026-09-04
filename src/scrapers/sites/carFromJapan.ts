import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { Page } from "playwright";
import { newContext } from "../utils/playwrightClient";
import { jitter, sleep } from "../utils/httpClient";
import { mileageToKm, parseNumeric } from "@/lib/normalize";
import { NormalizedListing, ScrapeOptions, SiteAdapter } from "../types";

const BASE_URL = "https://carfromjapan.com";
const CARD_SELECTOR = "div.p-4.border.border-gray-200.rounded-lg";
const PAGES_PER_MAKE = 2; // routine pass — unchanged from before
const DISCOVERY_MAX_PAGES = 3; // "New Arrivals" pass, stops early once caught up
const DEEP_PAGES_PER_MAKE = 20; // one-off deep crawl: ~500/make (25/page)

// CarFromJapan's own "New Arrivals" sort option.
const NEWEST_SORT = "-createdAt";

const MAKE_SLUGS = ["toyota", "nissan", "honda", "mazda", "mitsubishi", "subaru", "suzuki", "lexus", "daihatsu"];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toTitleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function parseCard($: cheerio.CheerioAPI, el: Element): NormalizedListing | null {
  const card = $(el);
  const text = normalizeWhitespace(card.text());

  const stockMatch = text.match(/\(CFJ(\w+)\)/);
  const link = card.find('a[href*="-for-sale-"]').first();
  const href = link.attr("href");
  if (!stockMatch || !href) return null;

  const afterStock = text.slice(text.indexOf(stockMatch[0]) + stockMatch[0].length);
  const title = afterStock.split("Registration year")[0].trim();
  const titleTokens = title.split(" ").filter(Boolean);
  if (titleTokens.length < 3) return null;

  const year = parseInt(titleTokens[0], 10);
  const make = toTitleCase(titleTokens[1]);
  const model = toTitleCase(titleTokens[2]);
  const lastToken = titleTokens[titleTokens.length - 1];
  const driveType = /^(2WD|4WD|AWD|FWD|RWD)$/i.test(lastToken) ? lastToken.toUpperCase() : undefined;

  const mileageMatch = text.match(/Mileage\s*([\d,]+)\s*(miles|km)/i);
  const engineMatch = text.match(/Engine\s*([\d.]+)\s*liters?/i);
  const transMatch = text.match(/Transmission\s*(Automatic|Manual|CVT)/i);

  const priceSection = text.match(/Car Price:(.*?)Delivery:/)?.[1] ?? "";
  const priceNums = [...priceSection.matchAll(/US\$\s*([\d,]+)/g)].map((m) => m[1]);
  const priceStr = priceNums[priceNums.length - 1];
  if (!priceStr || !year) return null;

  const priceUsd = Math.round(parseNumeric(priceStr));
  const mileageRaw = mileageMatch?.[1];
  const mileageUnit = mileageMatch?.[2]?.toLowerCase() ?? "miles";
  const mileageKm = mileageRaw ? mileageToKm(parseNumeric(mileageRaw), mileageUnit) : 0;

  const imageUrl = card
    .find('img[src*="static.carfromjapan.com/car_"]')
    .first()
    .attr("src");

  return {
    sourceId: `CFJ${stockMatch[1]}`,
    sourceUrl: new URL(href, BASE_URL).toString(),
    title,
    make,
    model,
    year,
    priceUsd,
    priceRaw: `US$ ${priceStr}`,
    priceCurrency: "USD",
    mileageKm,
    mileageRaw,
    mileageUnit,
    transmission: transMatch?.[1],
    driveType,
    engineCc: engineMatch ? Math.round(parseFloat(engineMatch[1]) * 1000) : undefined,
    imageUrl,
    description: title,
  };
}

type PageScanConfig = {
  maxPages: number;
  delayMs?: number;
  sort?: string;
  /** If given, stop paginating once a full page yields nothing outside this set. */
  stopWhenCaughtUpTo?: Set<string>;
};

async function scanPages(page: Page, makeSlug: string, config: PageScanConfig): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];
  const baseDelay = config.delayMs ?? 1500;

  for (let pageNum = 1; pageNum <= config.maxPages; pageNum++) {
    const params = new URLSearchParams();
    if (pageNum > 1) params.set("page", String(pageNum));
    if (config.sort) params.set("sortBy", config.sort);
    const qs = params.toString();
    const url = `${BASE_URL}/cheap-used-${makeSlug}-for-sale${qs ? `?${qs}` : ""}`;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(CARD_SELECTOR, { timeout: 15000 }).catch(() => {});
      await sleep(jitter(baseDelay));
    } catch (err) {
      console.error(`[car_from_japan] failed to load ${url}:`, err);
      break;
    }

    const html = await page.content();
    const $ = cheerio.load(html);
    const cards = $(CARD_SELECTOR).toArray();
    if (cards.length === 0) break;

    let newCount = 0;
    for (const el of cards) {
      const listing = parseCard($, el);
      if (!listing) continue;
      results.push(listing);
      if (config.stopWhenCaughtUpTo && !config.stopWhenCaughtUpTo.has(listing.sourceId)) newCount++;
    }

    if (config.stopWhenCaughtUpTo && newCount === 0) break;
  }

  return results;
}

function dedupe(listings: NormalizedListing[]): NormalizedListing[] {
  const bySourceId = new Map<string, NormalizedListing>();
  for (const listing of listings) bySourceId.set(listing.sourceId, listing);
  return Array.from(bySourceId.values());
}

async function scrapeMake(makeSlug: string, options: ScrapeOptions): Promise<NormalizedListing[]> {
  const context = await newContext();
  const page = await context.newPage();

  try {
    if (options.mode === "deep") {
      return await scanPages(page, makeSlug, { maxPages: DEEP_PAGES_PER_MAKE, delayMs: 4500 });
    }

    const routine = await scanPages(page, makeSlug, { maxPages: PAGES_PER_MAKE });
    const discovery = await scanPages(page, makeSlug, {
      maxPages: DISCOVERY_MAX_PAGES,
      sort: NEWEST_SORT,
      stopWhenCaughtUpTo: options.knownIds,
    });
    return dedupe([...routine, ...discovery]);
  } finally {
    await context.close();
  }
}

export const carFromJapanAdapter: SiteAdapter = {
  siteKey: "car_from_japan",
  displayName: "CarFromJapan",
  async scrape(options: ScrapeOptions) {
    const all: NormalizedListing[] = [];
    for (const slug of MAKE_SLUGS) {
      const listings = await scrapeMake(slug, options);
      console.log(`[car_from_japan] ${slug}: ${listings.length} listings`);
      all.push(...listings);
      options.onProgress?.({ make: slug, listingsSoFar: all.length });
    }
    return all;
  },
};
