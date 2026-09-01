import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { newContext } from "../utils/playwrightClient";
import { sleep } from "../utils/httpClient";
import { mileageToKm, parseNumeric } from "@/lib/normalize";
import { NormalizedListing, SiteAdapter } from "../types";

const BASE_URL = "https://carfromjapan.com";
const CARD_SELECTOR = "div.p-4.border.border-gray-200.rounded-lg";
const PAGES_PER_MAKE = 2; // 25 listings/page by default — bounded to stay polite on a 60k+/make catalog

const MAKE_SLUGS = ["toyota", "nissan", "honda", "mazda", "mitsubishi", "subaru", "suzuki", "lexus"];

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

async function scrapeMake(makeSlug: string): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];
  const context = await newContext();
  const page = await context.newPage();

  try {
    for (let pageNum = 1; pageNum <= PAGES_PER_MAKE; pageNum++) {
      const url =
        pageNum === 1
          ? `${BASE_URL}/cheap-used-${makeSlug}-for-sale`
          : `${BASE_URL}/cheap-used-${makeSlug}-for-sale?page=${pageNum}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector(CARD_SELECTOR, { timeout: 15000 }).catch(() => {});
        await sleep(1500);
      } catch (err) {
        console.error(`[car_from_japan] failed to load ${url}:`, err);
        break;
      }

      const html = await page.content();
      const $ = cheerio.load(html);
      const cards = $(CARD_SELECTOR).toArray();
      if (cards.length === 0) break;

      for (const el of cards) {
        const listing = parseCard($, el);
        if (listing) results.push(listing);
      }
    }
  } finally {
    await context.close();
  }

  return results;
}

export const carFromJapanAdapter: SiteAdapter = {
  siteKey: "car_from_japan",
  displayName: "CarFromJapan",
  async scrape() {
    const all: NormalizedListing[] = [];
    for (const slug of MAKE_SLUGS) {
      const listings = await scrapeMake(slug);
      console.log(`[car_from_japan] ${slug}: ${listings.length} listings`);
      all.push(...listings);
    }
    return all;
  },
};
