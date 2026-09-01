import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { CookieJar, politeFetch } from "../utils/httpClient";
import { parseNumeric } from "@/lib/normalize";
import { NormalizedListing, SiteAdapter } from "../types";

const BASE_URL = "https://www.sbtjapan.com";

// A curated set of makes (SBT's internal make_id) to scrape, matched to the makes we
// otherwise show sample data for. SBT lists tens of thousands of cars per make, so we
// only pull the first few pages per make to stay polite and keep a local scrape run fast.
const MAKES: { name: string; makeId: number }[] = [
  { name: "Toyota", makeId: 2 },
  { name: "Nissan", makeId: 3 },
  { name: "Honda", makeId: 4 },
  { name: "Mazda", makeId: 5 },
  { name: "Mitsubishi", makeId: 6 },
  { name: "Subaru", makeId: 7 },
  { name: "Suzuki", makeId: 9 },
  { name: "Lexus", makeId: 13 },
];

const PAGES_PER_MAKE = 2;

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

async function scrapeMake(makeName: string, makeId: number, cookieJar: CookieJar): Promise<NormalizedListing[]> {
  const results: NormalizedListing[] = [];

  for (let page = 1; page <= PAGES_PER_MAKE; page++) {
    const url = `${BASE_URL}/used-cars/search?make_id=${makeId}&page=${page}`;
    let html: string;
    try {
      html = await politeFetch(url, { cookieJar });
    } catch (err) {
      console.error(`[sbt_japan] failed to fetch ${url}:`, err);
      break;
    }

    const $ = cheerio.load(html);
    const cards = $(".card-product").toArray();
    if (cards.length === 0) break;

    for (const el of cards) {
      const listing = parseCard($, el, makeName);
      if (listing) results.push(listing);
    }
  }

  return results;
}

export const sbtJapanAdapter: SiteAdapter = {
  siteKey: "sbt_japan",
  displayName: "SBT Japan",
  async scrape() {
    const cookieJar = new CookieJar();
    const all: NormalizedListing[] = [];
    for (const { name, makeId } of MAKES) {
      const listings = await scrapeMake(name, makeId, cookieJar);
      console.log(`[sbt_japan] ${name}: ${listings.length} listings`);
      all.push(...listings);
    }
    return all;
  },
};
