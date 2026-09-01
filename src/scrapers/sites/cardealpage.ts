import { newContext } from "../utils/playwrightClient";
import { NormalizedListing, SiteAdapter } from "../types";

const BASE_URL = "https://www.cardealpage.com";

/**
 * CarDealPage sits behind AWS WAF Bot Control. A live check (2026-09) showed the site
 * returning HTTP 202 with an `x-amzn-waf-action: challenge` header on first load — a JS
 * challenge that a normal browser resolves automatically. In a real headless Chromium
 * session (via Playwright) the challenge did not resolve: a follow-up request came back
 * HTTP 403. AWS WAF Bot Control specifically fingerprints CDP-driven automation, which is
 * exactly what Playwright uses to control the browser.
 *
 * We deliberately don't try to defeat that fingerprinting (stealth patches, spoofed
 * fingerprints, etc.) — this adapter reports the block clearly instead of silently
 * returning nothing. If this site becomes reachable later (WAF config change, an
 * approved API key, etc.) this is the place to implement the real scraper — the
 * DOM/selectors were never reached because the challenge blocks every request first.
 */
async function checkAccessible(): Promise<boolean> {
  const context = await newContext();
  const page = await context.newPage();
  try {
    // A 200 is a real page; the WAF challenge itself answers with 202, and a failed
    // challenge follows up with 403 — neither is a status we can scrape against.
    const res = await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
    return res?.status() === 200;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

export const cardealpageAdapter: SiteAdapter = {
  siteKey: "cardealpage",
  displayName: "CarDealPage",
  async scrape(): Promise<NormalizedListing[]> {
    const accessible = await checkAccessible();
    if (!accessible) {
      console.warn(
        "[cardealpage] site is behind AWS WAF Bot Control and blocked this headless session (confirmed 2026-09) — skipping this run. See comments in src/scrapers/sites/cardealpage.ts."
      );
    }
    return [];
  },
};
