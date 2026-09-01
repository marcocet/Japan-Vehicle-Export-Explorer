import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { politeFetch } from "../utils/httpClient";
import { NormalizedListing, SiteAdapter } from "../types";

const BASE_URL = "https://www.carjunction.com";
const PER_PAGE = 25;
const PAGES_PER_MAKE = 4; // offsets 0, 25, 50, 75

// Most listings on this site show "Enquiry" instead of a price (contact for quote) —
// only ones with an active discount show a real US$ figure. We can only carry listings
// with a real price, so yield per page is low; that's a real characteristic of the site,
// not a scraper bug.
const MAKE_SLUGS = ["toyota", "nissan", "honda", "mazda", "mitsubishi", "suzuki", "subaru", "lexus"];

function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
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

async function scrapeMake(makeSlug: string): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];

  for (let page = 0; page < PAGES_PER_MAKE; page++) {
    const offset = page * PER_PAGE;
    const url = `${BASE_URL}/make/${makeSlug}.html?&page=${offset}`;
    let html: string;
    try {
      html = await politeFetch(url);
    } catch (err) {
      console.error(`[car_junction] failed to fetch ${url}:`, err);
      break;
    }

    const $ = cheerio.load(html);
    const rows = $('div.row[onmouseover*="F9F9F9"]').toArray();
    if (rows.length === 0) break;

    for (const el of rows) {
      const listing = parseCard($, el);
      if (listing) results.push(listing);
    }
  }

  return results;
}

export const carJunctionAdapter: SiteAdapter = {
  siteKey: "car_junction",
  displayName: "Car Junction",
  async scrape() {
    const all: NormalizedListing[] = [];
    for (const slug of MAKE_SLUGS) {
      const listings = await scrapeMake(slug);
      console.log(`[car_junction] ${slug}: ${listings.length} priced listings`);
      all.push(...listings);
    }
    return all;
  },
};
