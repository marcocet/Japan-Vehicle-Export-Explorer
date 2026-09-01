import { NormalizedListing, SiteAdapter } from "../types";

const LEGACY_URL = "http://www.ibcjapan.co.jp/"; // https to this host resets; plain http reveals the redirect below

/**
 * IBC Japan's original domain (ibcjapan.co.jp) no longer serves the site directly: HTTPS
 * connections to it are reset before any response arrives, but a plain HTTP request
 * reveals why — it's an S3-website redirect (301) to `https://www.ibcauto.com/`, i.e. the
 * business has moved domains. HTTPS was apparently never configured for the old S3
 * endpoint, which is why it resets instead of redirecting.
 *
 * The new domain, ibcauto.com, sits behind an AWS WAF rule that serves an explicit
 * "Human Verification" page requiring a CAPTCHA to be solved before any content loads
 * (confirmed live, 2026-09: `x-amzn-waf-action: captcha`, a `captcha.awswaf.com` script,
 * and a literal CAPTCHA widget in the response body). That's not a fingerprinting
 * challenge that a real browser resolves automatically — solving or bypassing a CAPTCHA
 * is something this adapter will not attempt, for the same reason a person is asked to
 * solve it: it exists specifically to require a human. There is no scraping path here
 * that doesn't mean defeating that control.
 */
async function checkRedirectsToGatedDomain(): Promise<{ blocked: boolean; detail: string }> {
  try {
    const res = await fetch(LEGACY_URL, { redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      return { blocked: true, detail: `redirects to ${location}, which requires solving a CAPTCHA` };
    }
    return { blocked: false, detail: `unexpected status ${res.status} from legacy domain` };
  } catch (err) {
    return { blocked: true, detail: `legacy domain unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export const ibcJapanAdapter: SiteAdapter = {
  siteKey: "ibc_japan",
  displayName: "IBC Japan",
  async scrape(): Promise<NormalizedListing[]> {
    const { blocked, detail } = await checkRedirectsToGatedDomain();
    if (blocked) {
      console.warn(
        `[ibc_japan] not scraping: ${detail}. This site is gated behind a mandatory CAPTCHA (confirmed 2026-09) — see comments in src/scrapers/sites/ibcJapan.ts for why this adapter won't try to get past it.`
      );
    }
    return [];
  },
};
