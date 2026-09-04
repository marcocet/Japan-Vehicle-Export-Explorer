import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { politeFetch } from "../utils/httpClient";
import { NormalizedListing, ScrapeOptions, SiteAdapter } from "../types";

const BASE_URL = "https://www.carjunction.com";
const PER_PAGE = 25;
const PAGES_PER_MAKE = 4; // routine pass — unchanged from before
const DISCOVERY_MAX_PAGES = 3; // newest-first (proxy) pass, stops early once caught up
const DEEP_PAGES_PER_MAKE = 20; // one-off deep crawl: ~500/make attempted

// Car Junction has no true "date added" sort — "Stock No. High to Low" is the closest
// available proxy, on the assumption that stock numbers are assigned roughly in order.
const NEWEST_SORT = "sno_desc";

// Most listings on this site show "Enquiry" instead of a price (contact for quote) —
// only ones with an active discount show a real US$ figure. We can only carry listings
// with a real price, so yield per page is low; that's a real characteristic of the site,
// not a scraper bug.
const MAKE_SLUGS = ["toyota", "nissan", "honda", "mazda", "mitsubishi", "suzuki", "subaru", "lexus", "daihatsu"];

function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function parseCard($: cheerio.CheerioAPI, el: Element): NormalizedListing | null {
  const card = $(el);
  const text = normalizeWhitespace(card.text());

  const priceMatch = text.match(/US\$\s*([\d,]+)(?:\s+([\d,]+))?/);
  if (!priceMatch) return null; // no real price quoted — "Enquiry only", can't carry a priceUsd

  const priceStr = priceMatch[2] ?? priceMatch[1]; // second number, if present, is the discounted price
  const priceUsd = parseInt(priceStr.replace(/,/g, ""), 10);

  const stockMatch = text.match(/Stock No\.\s*(\d+)/);
  const yearMatch = text.match(/Year:\s*(\d{4})/);
  const engineMatch = text.match(/Engine:\s*([\d.]+)\s*(Petrol|Diesel|Hybrid|Electric)/i);
  const transMatch = text.match(/Transmission:\s*(Automatic|Manual)/i);
  const mileageMatch = text.match(/Mileage:\s*([\d,]+)/);

  if (!stockMatch || !yearMatch) return null;

  const titleLink = card
    .find('a[href*="/car-detail/"]')
    .filter((_, a) => normalizeWhitespace($(a).text()).length > 5)
    .first();
  const title = normalizeWhitespace(titleLink.text());
  const href = titleLink.attr("href");
  if (!href || !title) return null;

  const titleTokens = title.split(" ");
  const make = titleTokens[1] ?? "Unknown";
  const model = titleTokens[2] ?? "Unknown";

  const img = card.find("img.lazy").first();
  const imageUrl = img.attr("data-original") ?? img.attr("src") ?? undefined;

  return {
    sourceId: stockMatch[1],
    sourceUrl: new URL(href, BASE_URL).toString(),
    title,
    make,
    model,
    year: parseInt(yearMatch[1], 10),
    priceUsd,
    priceRaw: `US$ ${priceStr}`,
    priceCurrency: "USD",
    mileageKm: mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, ""), 10) : 0,
    mileageRaw: mileageMatch?.[1],
    mileageUnit: "km",
    transmission: transMatch?.[1],
    fuelType: engineMatch?.[2],
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

async function scanPages(makeSlug: string, config: PageScanConfig): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];

  for (let page = 0; page < config.maxPages; page++) {
    const offset = page * PER_PAGE;
    let url = `${BASE_URL}/make/${makeSlug}.html?&page=${offset}`;
    if (config.sort) url += `&orderby=${config.sort}`;

    let html: string;
    try {
      html = await politeFetch(url, { delayMs: config.delayMs });
    } catch (err) {
      console.error(`[car_junction] failed to fetch ${url}:`, err);
      break;
    }

    const $ = cheerio.load(html);
    const rows = $('div.row[onmouseover*="F9F9F9"]').toArray();
    if (rows.length === 0) break;

    let newCount = 0;
    for (const el of rows) {
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

export const carJunctionAdapter: SiteAdapter = {
  siteKey: "car_junction",
  displayName: "Car Junction",
  async scrape(options: ScrapeOptions) {
    const all: NormalizedListing[] = [];

    for (const slug of MAKE_SLUGS) {
      let listings: NormalizedListing[];

      if (options.mode === "deep") {
        listings = await scanPages(slug, { maxPages: DEEP_PAGES_PER_MAKE, delayMs: 4500 });
      } else {
        const routine = await scanPages(slug, { maxPages: PAGES_PER_MAKE });
        const discovery = await scanPages(slug, {
          maxPages: DISCOVERY_MAX_PAGES,
          sort: NEWEST_SORT,
          stopWhenCaughtUpTo: options.knownIds,
        });
        listings = dedupe([...routine, ...discovery]);
      }

      all.push(...listings);
      console.log(`[car_junction] ${slug}: ${listings.length} priced listings`);
      options.onProgress?.({ make: slug, listingsSoFar: all.length });
    }

    return all;
  },
};
