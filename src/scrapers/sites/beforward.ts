import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { newContext } from "../utils/playwrightClient";
import { sleep } from "../utils/httpClient";
import { parseNumeric } from "@/lib/normalize";
import { NormalizedListing, SiteAdapter } from "../types";

const BASE_URL = "https://www.beforward.jp";
const ROW_SELECTOR = ".stocklist-row";
const PAGES_PER_MAKE = 2;

// BE FORWARD's own internal make ids, taken from its "Shop By Make" sidebar.
const MAKES: { name: string; makeId: number }[] = [
  { name: "Toyota", makeId: 1 },
  { name: "Nissan", makeId: 3 },
  { name: "Honda", makeId: 2 },
  { name: "Mazda", makeId: 4 },
  { name: "Mitsubishi", makeId: 5 },
  { name: "Subaru", makeId: 94 },
  { name: "Suzuki", makeId: 7 },
  { name: "Lexus", makeId: 68 },
];

function toTitleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeTransmission(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  if (v === "AT" || v === "CVT") return "Automatic";
  if (v === "MT") return "Manual";
  return raw.trim();
}

function parseRow($: cheerio.CheerioAPI, el: Element): NormalizedListing | null {
  const row = $(el);

  const link = row.find('a[href^="/"]').first();
  const href = link.attr("href");
  const titleRaw = row.find(".description-title-wrap").first().text();
  const title = titleRaw.replace(/\s+/g, " ").trim();
  if (!href || !title) return null;

  const titleTokens = title.split(" ");
  const year = parseInt(titleTokens[0], 10);
  const make = titleTokens[1] ? toTitleCase(titleTokens[1]) : undefined;
  const model = titleTokens[2] ? toTitleCase(titleTokens[2]) : undefined;
  if (!year || !make || !model) return null;

  const mileageText = row.find(".basic-spec-col.mileage").text();
  const engineText = row.find(".basic-spec-col.engine").text();
  const transText = row.find(".basic-spec-col.trans").text();
  const locationText = row.find(".basic-spec-col.location").text();
  const detailText = row.find(".table-detailed-spec").text().replace(/\s+/g, " ").trim();

  const mileageMatch = mileageText.match(/([\d,]+)\s*km/);
  const engineMatch = engineText.match(/([\d,]+)\s*cc/);
  const transMatch = transText.match(/(AT|MT|CVT)/);
  const locationMatch = locationText.match(/Location\s*(.+)/);
  const fuelMatch = detailText.match(/Fuel\s+(Petrol|Diesel|Hybrid|Electric)/i);
  const colorMatch = detailText.match(/Color\s+(\S+)/);
  const driveMatch = detailText.match(/Drive\s+(2WD|4WD|AWD|FWD|RWD)/);

  // The current asking price is `.price`; a `.original-vehicle-price` sibling (when
  // present) is the pre-discount price and is intentionally not used here.
  const priceText = row.find(".vehicle-price .price").first().text().trim();
  if (!priceText) return null;
  const priceUsd = Math.round(parseNumeric(priceText));
  if (!priceUsd) return null;

  const refMatch = row.text().match(/Ref No\.\s*([A-Z0-9]+)/);
  const sourceId = refMatch?.[1];
  if (!sourceId) return null;

  const imgSrc = row.find("img").first().attr("src");
  const imageUrl = imgSrc ? (imgSrc.startsWith("//") ? `https:${imgSrc}` : imgSrc) : undefined;

  return {
    sourceId,
    sourceUrl: new URL(href, BASE_URL).toString(),
    title,
    make,
    model,
    year,
    priceUsd,
    priceRaw: priceText,
    priceCurrency: "USD",
    mileageKm: mileageMatch ? Math.round(parseNumeric(mileageMatch[1])) : 0,
    mileageRaw: mileageMatch?.[1],
    mileageUnit: "km",
    transmission: normalizeTransmission(transMatch?.[1]),
    fuelType: fuelMatch?.[1],
    driveType: driveMatch?.[1],
    engineCc: engineMatch ? Math.round(parseNumeric(engineMatch[1])) : undefined,
    color: colorMatch?.[1],
    location: locationMatch?.[1]?.trim(),
    imageUrl,
    description: title,
  };
}

async function scrapeMake(makeName: string, makeId: number): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];
  const context = await newContext();
  const page = await context.newPage();

  try {
    for (let pageNum = 1; pageNum <= PAGES_PER_MAKE; pageNum++) {
      const url =
        pageNum === 1
          ? `${BASE_URL}/stocklist/make=${makeId}/sortkey=n`
          : `${BASE_URL}/stocklist/make=${makeId}/page=${pageNum}/sortkey=n`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector(ROW_SELECTOR, { timeout: 15000 }).catch(() => {});
        await sleep(1500);
      } catch (err) {
        console.error(`[beforward] failed to load ${url}:`, err);
        break;
      }

      const html = await page.content();
      const $ = cheerio.load(html);
      const rows = $(ROW_SELECTOR).toArray();
      if (rows.length === 0) break;

      for (const el of rows) {
        const listing = parseRow($, el);
        if (listing) results.push(listing);
      }
    }
  } finally {
    await context.close();
  }

  return results;
}

export const beforwardAdapter: SiteAdapter = {
  siteKey: "beforward",
  displayName: "BE FORWARD",
  async scrape() {
    const all: NormalizedListing[] = [];
    for (const { name, makeId } of MAKES) {
      const listings = await scrapeMake(name, makeId);
      console.log(`[beforward] ${name}: ${listings.length} listings`);
      all.push(...listings);
    }
    return all;
  },
};
