# Japan Vehicle Export Explorer

A single searchable page that aggregates used-vehicle listings from multiple Japanese
vehicle export sites — CarDealPage, CarFromJapan, BE FORWARD, SBT Japan, IBC Japan, and
Car Junction — with filters for make, model, year, price, mileage, transmission, fuel
type, vehicle type (sedan, SUV, Kei, etc.), and source site.

Listings are scraped on a schedule you control (not on every search) into a local
SQLite database; the web app reads only from that database.

## Stack

- **Next.js** (App Router, TypeScript) for both the frontend and the `/api/*` route handlers.
- **Prisma 7 + SQLite** for storage (via the `@prisma/adapter-better-sqlite3` driver
  adapter — Prisma 7 requires an explicit adapter rather than a bare connection string).
  Swapping to Postgres for a public deploy later is a schema/adapter change, not a rewrite.
- **Cheerio** for the two static-HTML sites, **Playwright** (headless Chromium) for the
  JS-rendered/bot-protected ones.

## Setup

```bash
npm install
npx prisma migrate dev   # creates prisma/dev.db and applies the schema
npx tsx prisma/seed.ts   # loads ~80 realistic sample listings so the UI is browsable immediately
npx playwright install --with-deps chromium   # only needed once, for the scraper
npm run dev
```

Open http://localhost:3000. Filters and results should populate immediately from the seed data.

## Running as a service

On this VM the app runs as a systemd service (`japan-export-explorer.service`) against
the production build (`npm run start`), not the dev server — it survives reboots and
auto-restarts if it crashes.

```bash
systemctl status japan-export-explorer    # check it's up
systemctl restart japan-export-explorer   # after pulling/making code changes
journalctl -u japan-export-explorer -f    # tail logs
```

**After any code change, rebuild before restarting** — unlike `npm run dev`, the
production server doesn't hot-reload:

```bash
npm run build && systemctl restart japan-export-explorer
```

The unit file is `/etc/systemd/system/japan-export-explorer.service`. For active
day-to-day development instead, stop the service and run `npm run dev` as usual.

## Scraping real data

```bash
npm run scrape
```

This runs every site adapter in `src/scrapers/sites/`, upserts what it finds into the
`Listing` table (keyed on `sourceSite` + the site's own listing id), and marks anything
not seen in the latest run for that site as `isActive: false` rather than deleting it —
so a single bad scrape run doesn't wipe a site's listings from search results.

It is **not** exposed as a web endpoint. It's a standalone script by design, so a future
public deployment can't let a stranger trigger an expensive scrape job by hitting a URL.

Run it manually whenever you want fresh data, or schedule it. On this machine it's
already scheduled via `crontab -l`, refreshing every 6 hours:

```cron
0 */6 * * * cd /root/japan_export_explorer && /usr/bin/npm run scrape >> /root/japan_export_explorer/scrape.log 2>&1
```

Output from each run appends to `scrape.log` in the project root. Adjust the interval by
editing the crontab (`crontab -e`) — the `0 */6 * * *` means "at minute 0 of every 6th
hour" (00:00, 06:00, 12:00, 18:00).

(macOS `launchd` equivalent, if deploying elsewhere: a `.plist` with `ProgramArguments`
pointing at the same command and a `StartInterval` in seconds.)

### Current scraper coverage (as of this build)

| Site | Status | Notes |
|---|---|---|
| SBT Japan | ✅ Working | Static HTML + a session cookie (site redirects-to-self on first hit while setting a Cloudflare cookie; handled automatically). |
| Car Junction | ✅ Working | Static HTML. Most listings show "Enquiry" instead of a price — only listings with a real `US$` figure can be carried, so yield per page is genuinely low (that's the site, not a bug). |
| CarFromJapan | ✅ Working | Requires a headless browser (plain HTTP gets a 403). |
| BE FORWARD | ✅ Working | Requires a headless browser; the real listing URL is `/stocklist/make={id}/...`, not the more obvious `/{make}/stocklist` guess. |
| CarDealPage | ⚠️ Blocked | Sits behind AWS WAF Bot Control, which fingerprints CDP-driven automation (the protocol Playwright/Selenium/Puppeteer all use) and returns a 403 to a real headless Chromium session after the initial JS challenge. This adapter detects and reports that rather than pretending to succeed, and deliberately doesn't attempt stealth/fingerprint-spoofing to get around it. See `src/scrapers/sites/cardealpage.ts`. |
| IBC Japan | ⚠️ Blocked | The `ibcjapan.co.jp` domain has moved — it now redirects to `ibcauto.com`, which requires solving a CAPTCHA before any content loads. That's an explicit human-verification wall, not something this adapter will try to defeat. See `src/scrapers/sites/ibcJapan.ts`. |

**The two remaining blocks are expected, not bugs to chase down further.** These are
third-party sites with no public API; scraping them is inherently best-effort, and some
sites deliberately gate automated access behind bot-detection or CAPTCHA specifically to
prevent it. Each site's adapter is an isolated, independently-replaceable unit in
`src/scrapers/sites/` for exactly this reason — a break in one doesn't affect the others,
and revisiting a blocked site later (a partner API, a change on their end) only means
rewriting that one file.

Scrapers are also built to be polite: a realistic User-Agent, a delay between requests,
and bounded pagination (a handful of pages per make) rather than exhaustively crawling
sites that list tens of thousands of vehicles per make.

### Getting CarDealPage (or any blocked site) listings in manually

Since CarDealPage won't allow automated access, there's a manual-import path for adding
individual listings you find by browsing the site yourself (a real browser isn't
affected by the bot check — only automation is):

1. Copy `manual-imports/cardealpage.example.json` to `manual-imports/cardealpage.json`.
2. For each listing you want, add an entry with the listing's URL, make, model, year,
   and price — copy these straight off the page, no need to clean up formatting
   (`"price": "$18,500"` and `"mileage": "62,000 km"` are both fine as-is). Everything
   else (transmission, color, image, etc.) is optional.
3. Run:
   ```bash
   npm run import:manual -- manual-imports/cardealpage.json
   ```
   This upserts the entries into the same `Listing` table the scrapers use (keyed on the
   listing URL), so they show up in search/filters exactly like scraped data, tagged with
   `sourceSite: "cardealpage"`.

Re-running the import after editing the file updates existing rows rather than
duplicating them. This is meant for a handful of listings you care about, not a way to
mirror the whole site — it never marks anything stale/inactive, so it only adds to what's
already there.

## Project structure

```
prisma/schema.prisma      # Listing model
prisma/seed.ts            # sample data for local development
prisma7.config.ts         # Prisma 7 config (datasource URL, migrations, seed command)
src/
  app/
    page.tsx              # main search UI (client component)
    api/listings/route.ts
    api/filters/route.ts
  components/             # FilterSidebar, ListingGrid, ListingCard, Pagination
  lib/
    db.ts                 # Prisma client singleton (with the SQLite driver adapter)
    normalize.ts           # currency/mileage normalization helpers
    bodyType.ts             # infers vehicle type (Sedan/SUV/Kei/etc.) from model + engine size
    types.ts               # shared frontend/API types
  scrapers/
    types.ts               # SiteAdapter interface
    runAll.ts              # orchestrator: runs every adapter, upserts, marks stale inactive
    manualImport.ts         # upserts hand-entered listings (see manual-imports/)
    backfillBodyType.ts     # one-off: fills in bodyType on rows scraped before it existed
    utils/httpClient.ts     # polite fetch wrapper (UA, delay, retry, cookie jar)
    utils/playwrightClient.ts # shared headless-browser context helper
    sites/                  # one file per site
```

## Notes on data

- Prices are normalized to USD, mileage to km, for consistent filtering/sorting across
  sites that report in different currencies and units.
- Where a site shows a discounted price alongside a struck-through original, the
  discounted price is what gets stored.
- Listing links point back to the original site ("View on [Site]") — this app is an
  aggregator, not a seller, and never claims to be the one selling the vehicle.
- Every listing tracks `firstSeenAt` (when our scraper first saw it — the closest proxy
  we have to a "date added," since most of these sites don't publish one) and, once a
  scrape run stops seeing a previously-active listing, `removedAt` (when it dropped out).
  Both are shown on each card. Removed listings aren't deleted — they're kept with
  `isActive: false` and hidden from search by default; check "Show sold/removed listings"
  in the sidebar to include them. Listings marked inactive before this field existed show
  no removal date, since we genuinely don't know when they disappeared.
- **Vehicle type (Sedan, SUV, Kei, etc.) is inferred, not scraped** — none of these sites
  reliably expose a body-type field per listing. `src/lib/bodyType.ts` derives it from the
  model name (a lookup table covering common JDM export models, plus Lexus's alphanumeric
  naming like `NX300`/`IS350`) and from engine size for Japan's "Kei" class (≤660cc). Runs
  automatically on every scrape and manual import; unrecognized models are left
  uncategorized rather than guessed, and just won't show up when filtering by type.
