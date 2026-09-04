import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { CookieJar, politeFetch } from "../utils/httpClient";
import { parseNumeric } from "@/lib/normalize";
import { NormalizedListing, ScrapeOptions, SiteAdapter } from "../types";

const BASE_URL = "https://www.sbtjapan.com";

// A curated set of makes (SBT's internal make_id) to scrape, matched to the makes we
// otherwise show sample data for. SBT lists tens of thousands of cars per make, so we
// only pull a bounded number of pages per make to stay polite and keep runs reasonable.
const MAKES: { name: string; makeId: number }[] = [
  { name: "Toyota", makeId: 2 },
  { name: "Nissan", makeId: 3 },
  { name: "Honda", makeId: 4 },
  { name: "Mazda", makeId: 5 },
  { name: "Mitsubishi", makeId: 6 },
  { name: "Subaru", makeId: 7 },
  { name: "Suzuki", makeId: 9 },
  { name: "Lexus", makeId: 13 },
  { name: "Daihatsu", makeId: 8 },
];

const PAGE_SIZE = 50;
const PAGES_PER_MAKE = 2; // routine pass — unchanged from before
const DISCOVERY_MAX_PAGES = 3; // newest-first pass, stops early once caught up to known stock
const DEEP_PAGES_PER_MAKE = 10; // one-off deep crawl: ~500/make
const DEEP_DELAY_MS = 4500; // slower, jittered pace for the deep crawl specifically

// SBT's own "Newest listed" sort option (captured from its sort dropdown).
const NEWEST_SORT = "is_dealer_stock,-is_photo_ok,is_reserved,-created_at";

function normalizeTransmission(raw: string): string | undefined {
  const v = raw.trim().toUpperCase();
  if (v === "AT" || v === "CVT") return "Automatic";
  if (v === "MT") return "Manual";
  return raw.trim() || undefined;
}

function normalizeFuelType(raw: string): string | undefined {
  const v = raw.trim().toUpperCase();
  if (v === "PETROL" || v === "GASOLINE") return "Petrol";
  if (v === "DIESEL") return "Diesel";
  if (v === "HYBRID") return "Hybrid";
  if (v === "ELECTRIC" || v === "EV") return "Electric";
  return raw.trim() || undefined;
}

function toTitleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function parseCard($: cheerio.CheerioAPI, el: Element, makeName: string): NormalizedListing | null {
  const card = $(el);
  const link = card.find("a.card-product__wrap").first();
  const href = link.attr("href");
  const stockId = card.find(".card-product__stock-value").first().text().trim();
  if (!href || !stockId) return null;

  const titleText = card.find(".card-product__product").first().text().trim();
  const titleParts = titleText.split(/\s+/).filter(Boolean);
  const dateToken = titleParts[0] ?? "";
  const year = parseInt(dateToken.split("/")[0], 10);
  const model = titleParts[2] ?? titleParts[1] ?? "Unknown";

  // Prefer the "Vehicle Price" figure; fall back to "Total Price" if that's all that's shown.
  const vehiclePriceEl = card.find(".card-product__vehicle-price .card-product__price").first();
  const totalPriceEl = card.find(".card-product__total-price .card-product__price").first();
  const priceEl = vehiclePriceEl.length ? vehiclePriceEl : totalPriceEl;
  const priceCurrency = priceEl
    .closest(".card-product__price-content")
    .find(".card-product__price-currency")
    .first()
    .text()
    .trim() || "USD";
  const priceRaw = priceEl.text().trim();
  const priceUsd = Math.round(parseNumeric(priceRaw));

  const specs: Record<string, string> = {};
  card.find(".card-product__status").each((_, statusEl) => {
    const classes = $(statusEl).attr("class") ?? "";
    const text = $(statusEl).text().trim();
    if (!text || text === "-") return;
    const match = classes.match(/-(model-code|mileage|engine-capacity|transmission|drive-type|steering-type|fuel-type|door|seats|body-color)\b/);
    // Some cards list engine-capacity twice (cc, then an engine code like "3ZR") — keep the first.
    if (match && !specs[match[1]]) specs[match[1]] = text;
  });

  const mileageKm = Math.round(parseNumeric(specs.mileage ?? "0"));
  const engineCc = /cc/i.test(specs["engine-capacity"] ?? "") ? Math.round(parseNumeric(specs["engine-capacity"])) : undefined;
  const location = card.find(".card-product__location-value").first().text().trim() || undefined;

  if (!year || !mileageKm || !priceUsd) return null;

  return {
    sourceId: stockId,
    sourceUrl: new URL(href, BASE_URL).toString(),
    title: titleText,
    make: makeName,
    model: toTitleCase(model),
    year,
    priceUsd,
    priceRaw,
    priceCurrency,
    mileageKm,
    mileageRaw: specs.mileage,
    mileageUnit: "km",
    transmission: specs.transmission ? normalizeTransmission(specs.transmission) : undefined,
    fuelType: specs["fuel-type"] ? normalizeFuelType(specs["fuel-type"]) : undefined,
    driveType: specs["drive-type"],
    engineCc,
    color: specs["body-color"] ? toTitleCase(specs["body-color"]) : undefined,
    location,
    imageUrl: card.find(".card-product__image img").first().attr("src") ?? undefined,
    description: titleText,
  };
}

type PageScanConfig = {
  maxPages: number;
  delayMs?: number;
  sort?: string;
  /** If given, stop paginating once a full page yields nothing outside this set. */
  stopWhenCaughtUpTo?: Set<string>;
};

async function scanPages(
  makeId: number,
  makeName: string,
  cookieJar: CookieJar,
  config: PageScanConfig
): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];

  for (let page = 1; page <= config.maxPages; page++) {
    let url = `${BASE_URL}/used-cars/search?make_id=${makeId}&page=${page}`;
    if (config.sort) url += `&s=${encodeURIComponent(config.sort)}`;

    let html: string;
    try {
      html = await politeFetch(url, { cookieJar, delayMs: config.delayMs });
    } catch (err) {
      console.error(`[sbt_japan] failed to fetch ${url}:`, err);
      break;
    }

    const $ = cheerio.load(html);
    const cards = $(".card-product").toArray();
    if (cards.length === 0) break;

    let newCount = 0;
    for (const el of cards) {
      const listing = parseCard($, el, makeName);
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

export const sbtJapanAdapter: SiteAdapter = {
  siteKey: "sbt_japan",
  displayName: "SBT Japan",
  async scrape(options: ScrapeOptions) {
    const cookieJar = new CookieJar();
    const all: NormalizedListing[] = [];

    for (const { name, makeId } of MAKES) {
      let listings: NormalizedListing[];

      if (options.mode === "deep") {
        listings = await scanPages(makeId, name, cookieJar, {
          maxPages: DEEP_PAGES_PER_MAKE,
          delayMs: DEEP_DELAY_MS,
        });
      } else {
        const routine = await scanPages(makeId, name, cookieJar, { maxPages: PAGES_PER_MAKE });
        const discovery = await scanPages(makeId, name, cookieJar, {
          maxPages: DISCOVERY_MAX_PAGES,
          sort: NEWEST_SORT,
          stopWhenCaughtUpTo: options.knownIds,
        });
        listings = dedupe([...routine, ...discovery]);
      }

      all.push(...listings);
      console.log(`[sbt_japan] ${name}: ${listings.length} listings (${PAGE_SIZE}/page)`);
      options.onProgress?.({ make: name, listingsSoFar: all.length });
    }

    return all;
  },
};
